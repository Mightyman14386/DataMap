/**
 * Privacy analysis service
 * Handles fetching policies, analyzing with Gemini LLM, and checking breaches
 */

import { env } from "~/env";

// Rate limiting queue to respect API limits
const requestQueue: {
	timestamp: number;
	provider: "gemini";
}[] = [];

// Keep track of last request time per provider (milliseconds)
let lastGeminiRequestTime = 0;
let lastHibpRequestTime = 0;
let hibpThrottleChain: Promise<void> = Promise.resolve();

const GEMINI_RATE_LIMIT_MS = 12000; // Free tier: 5 req/min = 12000ms between requests
const HIBP_RATE_LIMIT_MS = 1700;
const LLM_TIMEOUT_MS = 30000; // 30 second timeout for LLM calls
const LLM_MAX_RETRIES = 1; // Retry once on failure

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ensure summary is a non-empty string
 */
function ensureSummary(summary: unknown, fallback: string = "Privacy analysis based on policy review."): string {
	if (typeof summary === 'string' && summary.trim().length > 0) {
		return summary.trim();
	}
	return fallback;
}

/**
 * Retry a promise-returning function with exponential backoff
 */
async function retryWithBackoff<T>(
	fn: () => Promise<T>,
	maxRetries: number = LLM_MAX_RETRIES,
	baseDelayMs: number = 1000
): Promise<T | null> {
	let lastError: Error | null = null;
	
	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await Promise.race([
				fn(),
				new Promise<never>((_, reject) =>
					setTimeout(() => reject(new Error("LLM timeout")), LLM_TIMEOUT_MS)
				),
			]);
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			console.warn(`[LLM Retry] Attempt ${attempt + 1} failed: ${lastError.message}`);
			
			if (attempt < maxRetries) {
				const delay = baseDelayMs * Math.pow(2, attempt); // Exponential backoff
				console.log(`[LLM Retry] Waiting ${delay}ms before retry...`);
				await sleep(delay);
			}
		}
	}
	
	console.error(`[LLM Retry] All ${maxRetries + 1} attempts failed:`, lastError?.message);
	return null;
}

/**
 * Extract JSON from text that may be wrapped in markdown code blocks
 * Handles: ```json {...} ```, ```{...}```, or raw {...}
 */
function extractJSON<T>(content: string): T | null {
	if (!content || typeof content !== "string") return null;

	const trimmed = content.trim();
	
	// Try multiple markdown code block formats
	const markdownPatterns = [
		/```(?:json)?\s*([\s\S]*?)```/,  // Standard markdown code blocks
		/^```[\s\S]*?\n([\s\S]*?)\n```$/,  // With newlines at boundaries
		/```[\s\S]*?([\s\S]*?)[\s\S]*?```/,  // More permissive matching
	];
	
	let jsonText = trimmed;
	for (const pattern of markdownPatterns) {
		const match = trimmed.match(pattern);
		if (match && match[1]) {
			jsonText = match[1].trim();
			break;
		}
	}
	
	// Try to parse the extracted JSON
	try {
		const parsed = JSON.parse(jsonText);
		return parsed as T;
	} catch (e) {
		// Fallback: try to find raw JSON object/array using greedy matching
		let jsonCandidate: string | null = null;
		
		// Try to find the largest complete JSON object/array
		const objectMatch = jsonText.match(/\{[\s\S]*\}/);
		const arrayMatch = jsonText.match(/\[[\s\S]*\]/);
		
		if (objectMatch) {
			jsonCandidate = objectMatch[0];
		} else if (arrayMatch) {
			jsonCandidate = arrayMatch[0];
		}
		
		if (jsonCandidate) {
			try {
				const parsed = JSON.parse(jsonCandidate);
				return parsed as T;
			} catch (parseError) {
				console.warn("[JSON] Fallback parsing failed:", parseError instanceof Error ? parseError.message : String(parseError));
				return null;
			}
		}
	}

	return null;
}

function parseRetryAfterMs(headerValue: string | null): number {
	if (!headerValue) return HIBP_RATE_LIMIT_MS;

	const numericSeconds = Number(headerValue);
	if (!Number.isNaN(numericSeconds) && numericSeconds >= 0) {
		return Math.max(HIBP_RATE_LIMIT_MS, Math.ceil(numericSeconds * 1000));
	}

	const retryAt = new Date(headerValue).getTime();
	if (Number.isFinite(retryAt)) {
		return Math.max(HIBP_RATE_LIMIT_MS, retryAt - Date.now());
	}

	return HIBP_RATE_LIMIT_MS;
}

async function acquireHibpRateLimitSlot(): Promise<void> {
	const slot = hibpThrottleChain.then(async () => {
		const elapsed = Date.now() - lastHibpRequestTime;
		if (elapsed < HIBP_RATE_LIMIT_MS) {
			await sleep(HIBP_RATE_LIMIT_MS - elapsed);
		}
		lastHibpRequestTime = Date.now();
	});

	hibpThrottleChain = slot.catch(() => undefined);
	return slot;
}

export interface PolicyAnalysis {
	dataSelling: number;
	aiTraining: number;
	deleteDifficulty: number;
	summary: string;
	deletionInfo?: DeletionInfo;
}

export interface DeletionInfo {
	availability: "available" | "limited" | "unknown";
	accountDeletionUrl?: string;
	dataDeletionUrl?: string;
	retentionWindow?: string;
	instructions: string;
	source: "llm" | "heuristic" | "default";
}

export interface BreachInfo {
	wasBreached: boolean;
	breachName?: string;
	breachYear?: number;
	breachCheckStatus: "ok" | "rate_limited" | "unavailable";
}

function sanitizeUrl(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
		return trimmed;
	}
	return undefined;
}

function normalizeAvailability(value: unknown): DeletionInfo["availability"] {
	if (typeof value !== "string") return "unknown";
	const normalized = value.toLowerCase().trim();
	if (normalized === "available") return "available";
	if (normalized === "limited") return "limited";
	return "unknown";
}

function extractDeletionInfoHeuristic(
	policyText: string,
	domain: string,
): DeletionInfo {
	const lowered = policyText.toLowerCase();
	const availability =
		lowered.includes("delete your account") ||
		lowered.includes("account deletion") ||
		lowered.includes("delete account") ||
		lowered.includes("right to erasure") ||
		lowered.includes("data deletion")
			? "available"
			: lowered.includes("retain") || lowered.includes("retention")
				? "limited"
				: "unknown";

	const urlMatches = policyText.match(/https?:\/\/[^\s)\]"']+/g) || [];
	const candidateUrls = urlMatches.filter((url) => {
		const u = url.toLowerCase();
		return (
			u.includes("delete") ||
			u.includes("privacy") ||
			u.includes("account") ||
			u.includes("data-request") ||
			u.includes("support")
		);
	});

	const accountDeletionUrl = sanitizeUrl(candidateUrls[0]);
	const dataDeletionUrl = sanitizeUrl(candidateUrls[1]) || sanitizeUrl(candidateUrls[0]);

	const retentionMatch = policyText.match(
		/(\d{1,3}\s*(?:day|days|week|weeks|month|months|year|years))(?:[^\n]{0,80})(?:retain|retention|delete|deletion)/i,
	);

	const result: DeletionInfo = {
		availability,
		instructions:
			availability === "available"
				? "Policy indicates account/data deletion is available. Review the linked policy/account settings for exact steps."
				: availability === "limited"
					? "Policy references retention limits, but deletion steps may require support or additional verification."
					: "No explicit deletion flow was confidently detected. Check privacy policy and account settings manually.",
		source: "heuristic",
	};

	if (accountDeletionUrl) {
		result.accountDeletionUrl = accountDeletionUrl;
	}
	if (dataDeletionUrl) {
		result.dataDeletionUrl = dataDeletionUrl;
	}
	if (retentionMatch?.[1]) {
		result.retentionWindow = retentionMatch[1];
	}

	return result;
}

function defaultDeletionInfo(domain: string): DeletionInfo {
	return {
		availability: "unknown",
		dataDeletionUrl: `https://${domain}/privacy`,
		instructions:
			"Deletion details were not extracted. Start at the privacy policy and account settings pages for data/account deletion options.",
		source: "default",
	};
}

function normalizeDeletionInfo(
	rawDeletionInfo: unknown,
	domain: string,
	policyText: string | null,
): DeletionInfo {
	if (!rawDeletionInfo || typeof rawDeletionInfo !== "object") {
		if (policyText) {
			return extractDeletionInfoHeuristic(policyText, domain);
		}
		return defaultDeletionInfo(domain);
	}

	const info = rawDeletionInfo as Record<string, unknown>;
	const fallback = policyText
		? extractDeletionInfoHeuristic(policyText, domain)
		: defaultDeletionInfo(domain);

	const instructions =
		typeof info.instructions === "string" && info.instructions.trim().length > 0
			? info.instructions.trim()
			: fallback.instructions;

	const result: DeletionInfo = {
		availability: normalizeAvailability(info.availability),
		instructions,
		source: "llm",
	};

	const accountDeletionUrl =
		sanitizeUrl(info.accountDeletionUrl) || fallback.accountDeletionUrl;
	const dataDeletionUrl =
		sanitizeUrl(info.dataDeletionUrl) || fallback.dataDeletionUrl;
	const retentionWindow =
		typeof info.retentionWindow === "string" && info.retentionWindow.trim().length > 0
			? info.retentionWindow.trim()
			: fallback.retentionWindow;

	if (accountDeletionUrl) {
		result.accountDeletionUrl = accountDeletionUrl;
	}
	if (dataDeletionUrl) {
		result.dataDeletionUrl = dataDeletionUrl;
	}
	if (retentionWindow) {
		result.retentionWindow = retentionWindow;
	}

	return result;
}

export function getDeletionInfoForService(
	domain: string,
	policyText: string | null,
	analysis: PolicyAnalysis | null,
): DeletionInfo {
	if (analysis?.deletionInfo) {
		return analysis.deletionInfo;
	}

	if (policyText) {
		return extractDeletionInfoHeuristic(policyText, domain);
	}

	return defaultDeletionInfo(domain);
}

/**
 * Pre-cached policy analysis for common companies
 * Avoids repeated Gemini calls and Jina fetches for popular services
 */
const COMMON_COMPANY_CACHE: Record<string, PolicyAnalysis> = {
	"google.com": {
		dataSelling: 7,
		aiTraining: 9,
		deleteDifficulty: 5,
		summary:
			"Google uses comprehensive data collection for ad targeting and heavily trains AI/ML systems. Deletion is relatively straightforward but takes time.",
	},
	"facebook.com": {
		dataSelling: 8,
		aiTraining: 8,
		deleteDifficulty: 6,
		summary:
			"Meta sells user data to advertisers and uses it for AI model training. Deletion is possible but data shadows remain for 90+ days.",
	},
	"instagram.com": {
		dataSelling: 8,
		aiTraining: 8,
		deleteDifficulty: 6,
		summary:
			"Instagram (Meta) uses extensive data collection for ad targeting and AI model training. Deletion follows Meta corporate policy.",
	},
	"tiktok.com": {
		dataSelling: 9,
		aiTraining: 9,
		deleteDifficulty: 8,
		summary:
			"TikTok aggressively collects user behavior data and explicitly trains AI models on user-generated content. Account deletion involves lengthy data retention periods.",
	},
	"linkedin.com": {
		dataSelling: 7,
		aiTraining: 7,
		deleteDifficulty: 6,
		summary:
			"LinkedIn shares user data with third parties and uses it for AI training. Account deletion requires multi-step verification.",
	},
	"amazon.com": {
		dataSelling: 6,
		aiTraining: 7,
		deleteDifficulty: 4,
		summary:
			"Amazon collects purchase and behavioral data, uses it for recommendations and AI. Deletion process is clear but account history retained.",
	},
	"twitter.com": {
		dataSelling: 6,
		aiTraining: 7,
		deleteDifficulty: 5,
		summary:
			"Twitter shares user data with advertisers and trains recommendation models. Deletion is straightforward but data archival period is long.",
	},
	"x.com": {
		dataSelling: 6,
		aiTraining: 7,
		deleteDifficulty: 5,
		summary:
			"X (formerly Twitter) shares user data with advertisers and trains recommendation models. Deletion is straightforward but data archival period is long.",
	},
	"spotify.com": {
		dataSelling: 5,
		aiTraining: 6,
		deleteDifficulty: 4,
		summary:
			"Spotify collects listening data for recommendations and shares with partners. Deletion is straightforward without extended retention.",
	},
	"dropbox.com": {
		dataSelling: 2,
		aiTraining: 3,
		deleteDifficulty: 3,
		summary:
			"Dropbox has strong privacy controls. Minimal data selling and AI use. Clean deletion with no extended retention.",
	},
	"apple.com": {
		dataSelling: 2,
		aiTraining: 4,
		deleteDifficulty: 3,
		summary:
			"Apple emphasizes privacy and limits data selling. Uses data for on-device AI only. Straightforward account deletion.",
	},
	"microsoft.com": {
		dataSelling: 5,
		aiTraining: 7,
		deleteDifficulty: 4,
		summary:
			"Microsoft collects data for services and trains AI models. Some data sharing with partners. Account deletion is relatively straightforward.",
	},
	"github.com": {
		dataSelling: 2,
		aiTraining: 4,
		deleteDifficulty: 3,
		summary:
			"GitHub has clear privacy practices with minimal data selling. Limited AI training on user code. Straightforward account deletion.",
	},
	"openai.com": {
		dataSelling: 3,
		aiTraining: 9,
		deleteDifficulty: 4,
		summary:
			"OpenAI uses user data intensively for AI model training but doesn't actively sell data. Account deletion is straightforward.",
	},
	"reddit.com": {
		dataSelling: 6,
		aiTraining: 7,
		deleteDifficulty: 5,
		summary:
			"Reddit collects user data for targeting and trains AI models on content. Data deletion is possible but community content remains.",
	},
	"discord.com": {
		dataSelling: 3,
		aiTraining: 4,
		deleteDifficulty: 3,
		summary:
			"Discord has moderate privacy practices with limited data selling. AI use is primarily for moderation and recommendations. Deletion is straightforward.",
	},
	"gmail.com": {
		dataSelling: 7,
		aiTraining: 9,
		deleteDifficulty: 5,
		summary:
			"Gmail (Google) scans emails for ads and trains AI models. Deletion follows Google account policies with data archival.",
	},
	"outlook.com": {
		dataSelling: 5,
		aiTraining: 6,
		deleteDifficulty: 4,
		summary:
			"Outlook (Microsoft) uses moderate data collection for ads and AI. Account deletion is relatively straightforward.",
	},
	"youtube.com": {
		dataSelling: 7,
		aiTraining: 9,
		deleteDifficulty: 5,
		summary:
			"YouTube (Google) heavily uses viewing data for recommendations and AI training. Deletion follows Google account policies.",
	},
};

/**
 * Fetch privacy policy text from a domain using Jina reader
 */
export async function fetchPrivacyPolicyText(
	domain: string,
): Promise<string | null> {
	try {
		const urls = [
			`https://${domain}/privacy`,
			`https://${domain}/privacy-policy`,
			`https://${domain}/policies/privacy`,
			`https://${domain}/legal/privacy`,
			`https://${domain}/about/privacy`,
			`https://${domain}/policy/privacy`,
			`https://www.${domain}/privacy`,
			`https://www.${domain}/privacy-policy`,
		];

		let consecutiveErrors = 0;
		const MAX_CONSECUTIVE_ERRORS = 2; // Fail fast after 2 consecutive errors

		for (const url of urls) {
			try {
				const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;
				console.log(`[Jina] Attempting to fetch from: ${url}`);
				
				// Use AbortController with timeout
				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout per request
				
				const resp = await fetch(jinaUrl, {
					method: "GET",
					headers: {
						Accept: "text/markdown",
						"User-Agent": "Mozilla/5.0 (compatible; DataMapBot/1.0)",
					},
					signal: controller.signal,
				});

				clearTimeout(timeoutId);

				if (resp.ok) {
					const text = await resp.text();
					if (text && text.length > 500) {
						console.log(`[Jina] ✓ Successfully fetched policy from ${url} (${text.length} chars)`);
						return text.slice(0, 7000);
					} else if (text) {
						console.warn(`[Jina] Content too short from ${url}: ${text.length} chars`);
						consecutiveErrors++;
					}
				} else if (resp.status === 429) {
					console.warn(`[Jina] ⚠ Rate limited (429) for ${domain}, skipping remaining URLs`);
					return null;
				} else if (resp.status === 400 || resp.status === 422) {
					console.warn(`[Jina] HTTP ${resp.status} from ${url} (likely invalid path)`);
					consecutiveErrors++;
					// Fail fast after repeated errors from same domain
					if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
						console.warn(`[Jina] ✗ Domain ${domain} returning errors, skipping remaining URLs`);
						return null;
					}
				} else {
					console.warn(`[Jina] HTTP ${resp.status} from ${url}`);
					consecutiveErrors++;
				}
			} catch (err) {
				if (err instanceof Error && err.name === 'AbortError') {
					console.warn(`[Jina] ⏱ Timeout (5s) fetching ${url}`);
				} else {
					console.warn(`[Jina] Fetch failed for ${url}:`, err instanceof Error ? err.message : err);
				}
				consecutiveErrors++;
				
				// Skip this domain if too many errors
				if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
					console.warn(`[Jina] ✗ ${domain} hit max errors, skipping remaining URLs`);
					return null;
				}
				continue;
			}
		}

		console.warn(`[Jina] ✗ Could not fetch policy from any URL for ${domain}`);
		return null;
	} catch (error) {
		console.error(`[Jina] Unexpected error fetching policy for ${domain}:`, error);
		return null;
	}
}

/**
 * Analyze privacy policy with Google Gemini
 */
export async function analyzePrivacyPolicy(
	serviceName: string,
	policyText: string,
	domain?: string,
): Promise<PolicyAnalysis | null> {
	// Check cache first for common companies
	if (domain) {
		const normalizedDomain = domain.toLowerCase().trim();
		const cached = COMMON_COMPANY_CACHE[normalizedDomain];
		if (cached) {
			console.log(`[Analysis] Using built-in cache for ${normalizedDomain}`);
			return cached;
		}
	}
	
	try {
		// Apply rate limiting BEFORE making the request
		await waitForRateLimit();

		const geminiKey = env.GEMINI_API_KEY;
		
		if (!geminiKey) {
			console.warn(`[Analysis] ✗ No Gemini API key configured for ${serviceName}`);
			return null;
		}

		const prompt = `You are a privacy policy analyst specializing in data privacy risks. Analyze the following privacy policy for ${serviceName}. 

Based on the actual policy text, rate on a scale of 1-10 where 1 is least concerning and 10 is most concerning:

1. **Data Selling Risk**: Does the company sell, share, or license user data to third parties for profit? (1=never sells data, 10=actively monetizes all user data)
2. **AI Training Risk**: Does the company use user data to train AI/ML models? (1=never uses for AI training, 10=heavily trains AI models on user data)
3. **Deletion Difficulty**: How hard/long is it to delete your account and all personal data? (1=very easy, instant deletion, 10=nearly impossible, prolonged data retention)

Be objective and base ratings only on what the policy explicitly states or clearly implies. If a practice is not mentioned, assume neutral (around 5).

IMPORTANT: Return ONLY raw JSON with NO markdown formatting, NO code blocks, NO triple backticks, NO explanation text. Start with { and end with }.

Raw JSON response:
{
  "dataSelling": <integer 1-10>,
  "aiTraining": <integer 1-10>,
  "deleteDifficulty": <integer 1-10>,
  "summary": "<2-sentence summary of the key privacy concerns based on the policy>",
  "deletionInfo": {
    "availability": "available|limited|unknown",
    "accountDeletionUrl": "<absolute https URL or null>",
    "dataDeletionUrl": "<absolute https URL or null>",
    "retentionWindow": "<e.g. 30 days, 90 days, unknown>",
    "instructions": "<clear account/data deletion steps for a user>"
  }
}

Privacy Policy:
${policyText}`;

		// Use retry logic with timeout for Gemini
		console.log(`[Analysis] Analyzing ${serviceName} with Gemini (timeout: ${LLM_TIMEOUT_MS}ms, retries: ${LLM_MAX_RETRIES})`);
		const analysisResult = await retryWithBackoff(
			async () => {
				console.log(`[Analysis] Sending request to Gemini for ${serviceName}`);
				const response = await fetch(
					`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							contents: [
								{
									parts: [
										{
											text: prompt,
										},
									],
								},
							],
							generationConfig: {
								temperature: 0.2,
								maxOutputTokens: 8192,
							},
						}),
					},
				);

				if (!response.ok) {
					const errorText = await response.text();
					console.error(`[Analysis] Gemini API error (${response.status}) for ${serviceName}:`, errorText.substring(0, 300));
					throw new Error(`Gemini API error: ${response.status} - ${errorText.substring(0, 100)}`);
				}

				const data = await response.json();
				const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

				if (!content) {
					console.error(`[Analysis] No content in Gemini response for ${serviceName}`, JSON.stringify(data).substring(0, 200));
					throw new Error("No content in Gemini response");
				}

				console.log(`[Analysis] Raw Gemini response (first 300 chars):`, content.substring(0, 300));

				const parsed = extractJSON<any>(content);
				if (!parsed) {
					console.error(`[Analysis] Could not extract JSON from Gemini response for ${serviceName}:`, content.substring(0, 500));
					throw new Error("Could not extract JSON from Gemini response");
				}

				// Safely parse numeric values - handle both numbers and strings
				const toNumber = (val: unknown, defaultVal: number = 5): number => {
					if (typeof val === 'number') return Math.max(1, Math.min(10, val));
					if (typeof val === 'string') {
						const num = parseInt(val, 10);
						if (!isNaN(num)) return Math.max(1, Math.min(10, num));
					}
					return defaultVal;
				};

				const result = {
					dataSelling: toNumber(parsed.dataSelling, 5),
					aiTraining: toNumber(parsed.aiTraining, 5),
					deleteDifficulty: toNumber(parsed.deleteDifficulty, 5),
					summary: ensureSummary(parsed.summary, `Privacy analysis for ${serviceName} based on policy review.`),
					deletionInfo: normalizeDeletionInfo(parsed.deletionInfo, domain || "unknown.com", policyText),
				};

				console.log(`[Analysis] ✓ Successfully parsed: selling=${result.dataSelling}, aiTraining=${result.aiTraining}, deletion=${result.deleteDifficulty}`);
				return result;
			},
			LLM_MAX_RETRIES
		);

		if (analysisResult) {
			console.log(`[Analysis] ✓ ${serviceName}: selling=${analysisResult.dataSelling}, aiTraining=${analysisResult.aiTraining}, deletion=${analysisResult.deleteDifficulty}`);
			return analysisResult;
		}

		console.warn(`[Analysis] ✗ Analysis failed for ${serviceName}`);
		return null;
	} catch (error) {
		console.error(`[Analysis] Unexpected error analyzing ${serviceName}:`, error instanceof Error ? error.message : error);
		return null;
	}
}


/**
 * Wait for rate limit to pass for a given provider
 */
async function waitForRateLimit(): Promise<void> {
	const elapsed = Date.now() - lastGeminiRequestTime;
	if (elapsed < GEMINI_RATE_LIMIT_MS) {
		await new Promise((resolve) => setTimeout(resolve, GEMINI_RATE_LIMIT_MS - elapsed));
	}
	lastGeminiRequestTime = Date.now();
}

/**
 * Analyze multiple privacy policies in a single API call (batch mode)
 * More efficient than analyzing one at a time
 */
export async function batchAnalyzePrivacyPolicies(
	policies: Array<{
		serviceName: string;
		domain: string;
		policyText: string;
	}>,
): Promise<Record<string, PolicyAnalysis>> {
	if (policies.length === 0) {
		return {};
	}

	// Check cache first - only analyze non-cached policies
	const nonCachedPolicies = policies.filter((p) => {
		const cached = COMMON_COMPANY_CACHE[p.domain.toLowerCase().trim()];
		return !cached;
	});

	if (nonCachedPolicies.length === 0) {
		// All policies are cached
		const result: Record<string, PolicyAnalysis> = {};
		for (const policy of policies) {
			const cached = COMMON_COMPANY_CACHE[policy.domain.toLowerCase().trim()];
			if (cached) {
				result[policy.domain] = cached;
			}
		}
		return result;
	}

	try {
		// Try Gemini first with timeout and retry
		const geminiKey = env.GEMINI_API_KEY;
		if (geminiKey) {
			await waitForRateLimit("gemini");
			console.log(`[Batch Analysis] Attempting Gemini with timeout=${LLM_TIMEOUT_MS}ms and ${LLM_MAX_RETRIES} retries`);
			const geminiBatchResult = await retryWithBackoff(
				() => batchAnalyzeWithGemini(nonCachedPolicies, geminiKey),
				LLM_MAX_RETRIES
			);
			if (geminiBatchResult) {
				// Merge cached results
				const allCached = COMMON_COMPANY_CACHE;
				const result: Record<string, PolicyAnalysis> = {
					...geminiBatchResult,
				};
				for (const policy of policies) {
					const normalizedDomain = policy.domain.toLowerCase().trim();
					const cachedValue =
						allCached[normalizedDomain as keyof typeof COMMON_COMPANY_CACHE];
					if (cachedValue) {
						result[normalizedDomain] = cachedValue;
					}
				}
				return result;
			}
		}

		console.warn(`[Batch Analysis] No LLM providers available - using cached data only`);
		// Return cached data for any policies we have
		const result: Record<string, PolicyAnalysis> = {};
		for (const policy of policies) {
			const normalizedDomain = policy.domain.toLowerCase().trim();
			const cachedValue = COMMON_COMPANY_CACHE[normalizedDomain as keyof typeof COMMON_COMPANY_CACHE];
			if (cachedValue) {
				result[normalizedDomain] = cachedValue;
			}
		}
		return result;
	} catch (error) {
		console.error("Batch analysis error:", error);
		return {};
	}
}

/**
 * Batch analyze using Google Gemini
 */
async function batchAnalyzeWithGemini(
	policies: Array<{
		serviceName: string;
		domain: string;
		policyText: string;
	}>,
	apiKey: string,
): Promise<Record<string, PolicyAnalysis> | null> {
	try {
		// Create analysis request for multiple policies
		const policiesText = policies
			.map(
				(p, i) => `
POLICY ${i + 1}: ${p.serviceName} (${p.domain})
${p.policyText.substring(0, 2000)}
---`,
			)
			.join("\n");

		const prompt = `You are a privacy policy analyst specializing in data privacy risks. Analyze the following privacy policies.

For EACH policy, rate on a scale of 1-10:
1. **Data Selling Risk**: Does the company sell, share, or license user data to third parties? (1=never, 10=actively monetizes all data)
2. **AI Training Risk**: Does the company use user data to train AI/ML models? (1=never, 10=heavily uses for AI training)
3. **Deletion Difficulty**: How hard/long is it to delete your account? (1=very easy/instant, 10=nearly impossible/prolonged retention)

IMPORTANT: Return ONLY raw JSON array with NO markdown formatting, NO code blocks, NO triple backticks, NO explanation text. Start with [ and end with ].

Raw JSON array response:
[
  {
    "domain": "example1.com",
    "dataSelling": <integer 1-10>,
    "aiTraining": <integer 1-10>,
    "deleteDifficulty": <integer 1-10>,
    "summary": "<2-sentence summary>",
    "deletionInfo": {
      "availability": "available|limited|unknown",
      "accountDeletionUrl": "<absolute https URL or null>",
      "dataDeletionUrl": "<absolute https URL or null>",
      "retentionWindow": "<e.g. 30 days, 90 days, unknown>",
      "instructions": "<clear account/data deletion steps for a user>"
    }
  },
  ...
]

Policies to analyze:
${policiesText}`;

		const response = await fetch(
			`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					contents: [
						{
							parts: [
								{
									text: prompt,
								},
							],
						},
					],
					generationConfig: {
						temperature: 0.2,
						maxOutputTokens: 8192,
					},
				}),
			},
		);

		if (!response.ok) {
			console.error(`Gemini batch API error (${response.status})`);
			const errorText = await response.text();
			console.error("Error response:", errorText);
			console.error(`API URL used: https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`);
			return null;
		}

		const data = await response.json();
		const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

		if (!content) {
			console.error("No content in Gemini batch response");
			return null;
		}

		console.log(`[Gemini Batch] Raw response (first 200 chars):`, content.substring(0, 200));

		const parsed = extractJSON<any[]>(content);
		if (!Array.isArray(parsed)) {
			console.error("Could not extract JSON array from response:", content.substring(0, 500));
			return null;
		}

		// Safely parse numeric values
		const toNumber = (val: unknown, defaultVal: number = 5): number => {
			if (typeof val === 'number') return Math.max(1, Math.min(10, val));
			if (typeof val === 'string') {
				const num = parseInt(val, 10);
				if (!isNaN(num)) return Math.max(1, Math.min(10, num));
			}
			return defaultVal;
		};

		const result: Record<string, PolicyAnalysis> = {};

		for (const item of parsed) {
			if (item && item.domain) {
				const matchedPolicy = policies.find((p) => p.domain === item.domain);
				const dataSelling = toNumber(item.dataSelling, 5);
				const aiTraining = toNumber(item.aiTraining, 5);
				const deleteDifficulty = toNumber(item.deleteDifficulty, 5);
				const summary = ensureSummary(item.summary, "Privacy analysis based on policy review.");

				result[item.domain] = {
					dataSelling,
					aiTraining,
					deleteDifficulty,
					summary,
					deletionInfo: normalizeDeletionInfo(
						item.deletionInfo,
						item.domain,
						matchedPolicy?.policyText || null,
					),
				};
				console.log(`[Gemini Batch] ✓ ${item.domain}: selling=${dataSelling}, aiTraining=${aiTraining}, deletion=${deleteDifficulty}, summary="${summary.substring(0, 50)}..."`);
			}
		}

		console.log(`[Gemini Batch] Successfully processed ${Object.keys(result).length} policies`);
		return result;
	} catch (error) {
		console.error("Gemini batch analysis error:", error);
		return null;
	}
}

/**
 * Check if a domain has been in a known data breach using HIBP API
 */
export async function checkDataBreach(
	domain: string,
): Promise<BreachInfo> {
	try {
		const hibpKey = env.HIBP_API_KEY;
		if (!hibpKey) {
			console.log("[HIBP] No HIBP API key configured - skipping breach check");
			return { wasBreached: false, breachCheckStatus: "unavailable" };
		}

		console.log(`[HIBP] Checking breach for domain: ${domain}`);

		const url = `https://haveibeenpwned.com/api/v3/breaches?domain=${encodeURIComponent(
			domain,
		)}`;

		const maxAttempts = 3;
		let breaches: unknown = null;
		let sawRateLimit = false;

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			await acquireHibpRateLimitSlot();

			const resp = await fetch(url, {
				headers: {
					"hibp-api-key": hibpKey,
					"user-agent": "DataMapHackathon/1.0",
				},
			});

			if (resp.ok) {
				breaches = await resp.json();
				break;
			}

			if (resp.status === 429 && attempt < maxAttempts) {
				sawRateLimit = true;
				const waitMs = parseRetryAfterMs(resp.headers.get("retry-after"));
				console.warn(
					`HIBP rate limited for ${domain}; retrying in ${waitMs}ms (attempt ${attempt}/${maxAttempts})`,
				);
				await sleep(waitMs);
				continue;
			}

			if (resp.status === 429) {
				console.warn(`HIBP rate limited for ${domain}; retries exhausted`);
				return { wasBreached: false, breachCheckStatus: "rate_limited" };
			}

			console.warn(
				`HIBP API error for ${domain} (${resp.status}):`,
				resp.statusText,
			);
			return {
				wasBreached: false,
				breachCheckStatus: sawRateLimit ? "rate_limited" : "unavailable",
			};
		}

		if (!breaches) {
			console.warn(`HIBP check exhausted retries for ${domain}`);
			return {
				wasBreached: false,
				breachCheckStatus: sawRateLimit ? "rate_limited" : "unavailable",
			};
		}

		if (!Array.isArray(breaches) || breaches.length === 0) {
			console.log(`[HIBP] ✓ No breaches found for ${domain}`);
			return { wasBreached: false, breachCheckStatus: "ok" };
		}

		// Get the most recent breach
		const sorted = breaches.sort(
			(a: any, b: any) =>
				new Date(b.BreachDate).getTime() - new Date(a.BreachDate).getTime(),
		);
		const latest = sorted[0];

		console.log(`[HIBP] ⚠ Breach detected for ${domain}: ${latest.Title}`);
		return {
			wasBreached: true,
			breachName: latest.Title,
			breachYear: parseInt(latest.BreachDate?.slice(0, 4) || "0", 10),
			breachCheckStatus: "ok",
		};
	} catch (error) {
		console.error(`HIBP breach check error for ${domain}:`, error);
		return { wasBreached: false, breachCheckStatus: "unavailable" };
	}
}

/**
 * Full end-to-end analysis: fetch policy, analyze, check breach
 */
export async function analyzeService(
	serviceName: string,
	domain: string,
): Promise<{
	policyText: string | null;
	analysis: PolicyAnalysis | null;
	deletionInfo: DeletionInfo;
	breach: BreachInfo;
}> {
	// Check cache first - if we have it cached, skip policy fetching
	const normalizedDomain = domain.toLowerCase().trim();
	const cached = COMMON_COMPANY_CACHE[normalizedDomain];
	
	if (cached) {
		console.log(`Using cached analysis for ${normalizedDomain}`);
		const breach = await checkDataBreach(normalizedDomain);
		return {
			policyText: null, // Not fetched since cached
			analysis: cached,
			deletionInfo: getDeletionInfoForService(normalizedDomain, null, cached),
			breach,
		};
	}

	// Not cached - fetch and analyze
	const policyText = await fetchPrivacyPolicyText(normalizedDomain);
	const analysis = policyText
		? await analyzePrivacyPolicy(serviceName, policyText, normalizedDomain)
		: null;
	const breach = await checkDataBreach(normalizedDomain);

	return {
		policyText,
		analysis,
		deletionInfo: getDeletionInfoForService(normalizedDomain, policyText, analysis),
		breach,
	};
}
