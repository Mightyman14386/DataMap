/**
 * Privacy analysis service
 * Handles fetching policies, analyzing with LLM (Gemini primary, Claude fallback), and checking breaches
 */

import { env } from "~/env";

// Rate limiting queue to respect API limits
const requestQueue: {
	timestamp: number;
	provider: "gemini" | "claude";
}[] = [];

// Keep track of last request time per provider (milliseconds)
let lastGeminiRequestTime = 0;
let lastClaudeRequestTime = 0;
let lastHibpRequestTime = 0;
let hibpThrottleChain: Promise<void> = Promise.resolve();

const GEMINI_RATE_LIMIT_MS = 12000; // Free tier: 5 req/min = 12000ms between requests
const CLAUDE_RATE_LIMIT_MS = 2000;
const HIBP_RATE_LIMIT_MS = 1700;
const LLM_TIMEOUT_MS = 30000; // 30 second timeout for LLM calls
const LLM_MAX_RETRIES = 1; // Retry once on failure

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
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

	// Try to extract from markdown code blocks first (```json ... ``` or ``` ... ```)
	const markdownMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
	const jsonText = markdownMatch ? markdownMatch[1].trim() : content.trim();

	// Try to parse the extracted JSON
	try {
		return JSON.parse(jsonText);
	} catch {
		// Fallback: try to find raw JSON object/array
		const objectMatch = jsonText.match(/\{[\s\S]*\}/);
		const arrayMatch = jsonText.match(/\[[\s\S]*\]/);
		
		const jsonCandidate = objectMatch?.[0] || arrayMatch?.[0];
		if (jsonCandidate) {
			try {
				return JSON.parse(jsonCandidate);
			} catch {
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
		];

		for (const url of urls) {
			try {
				const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;
				const resp = await fetch(jinaUrl, {
					method: "GET",
					headers: {
						Accept: "text/markdown",
					},
				});

				if (resp.ok) {
					const text = await resp.text();
					if (text && text.length > 500) {
						return text.slice(0, 7000); // Increased limit for better analysis
					}
				}
			} catch {
				continue;
			}
		}

		return null;
	} catch (error) {
		console.error(`Error fetching privacy policy for ${domain}:`, error);
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
			console.log(`Using cached analysis for ${normalizedDomain}`);
			return cached;
		}
	}
	try {
		// Apply rate limiting BEFORE making the request
		await waitForRateLimit("gemini");

		const geminiKey = env.GEMINI_API_KEY;
		const claudeKey = env.ANTHROPIC_API_KEY;
		if (!geminiKey) {
			if (claudeKey) {
				console.warn("No Gemini API key configured; falling back to Claude");
				return await analyzePrivacyPolicyWithClaude(serviceName, policyText, claudeKey);
			}
			console.warn("No Gemini or Claude API key configured");
			return null;
		}

		const prompt = `You are a privacy policy analyst specializing in data privacy risks. Analyze the following privacy policy for ${serviceName}. 

Based on the actual policy text, rate on a scale of 1-10 where 1 is least concerning and 10 is most concerning:

1. **Data Selling Risk**: Does the company sell, share, or license user data to third parties for profit? (1=never sells data, 10=actively monetizes all user data)
2. **AI Training Risk**: Does the company use user data to train AI/ML models? (1=never uses for AI training, 10=heavily trains AI models on user data)
3. **Deletion Difficulty**: How hard/long is it to delete your account and all personal data? (1=very easy, instant deletion, 10=nearly impossible, prolonged data retention)

Be objective and base ratings only on what the policy explicitly states or clearly implies. If a practice is not mentioned, assume neutral (around 5).

Respond with ONLY valid JSON (no markdown, no code blocks, no explanations):
{
  "dataSelling": <number 1-10>,
  "aiTraining": <number 1-10>,
  "deleteDifficulty": <number 1-10>,
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
		const analysisResult = await retryWithBackoff(
			async () => {
				const response = await fetch(
					`https://generativelanguage.googleapis.com/v1beta/models/gemma-3-12b-it:generateContent?key=${geminiKey}`,
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
								maxOutputTokens: 500,
							},
						}),
					},
				);

				if (!response.ok) {
					const errorText = await response.text();
					console.error(`Gemini API error (${response.status}):`, errorText.substring(0, 200));
					throw new Error(`Gemini API error: ${response.status}`);
				}

				const data = await response.json();
				const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

				if (!content) {
					throw new Error("No content in Gemini response");
				}

				const parsed = extractJSON<any>(content);
				if (!parsed) {
					throw new Error("Could not extract JSON from Gemini response");
				}

				return {
					dataSelling: Math.max(1, Math.min(10, parseInt(parsed.dataSelling) || 5)),
					aiTraining: Math.max(1, Math.min(10, parseInt(parsed.aiTraining) || 5)),
					deleteDifficulty: Math.max(1, Math.min(10, parseInt(parsed.deleteDifficulty) || 5)),
					summary: parsed.summary || `Privacy analysis for ${serviceName} based on policy review.`,
					deletionInfo: normalizeDeletionInfo(parsed.deletionInfo, domain || "unknown.com", policyText),
				};
			},
			LLM_MAX_RETRIES
		);

		if (analysisResult) {
			console.log(`[Gemini Analysis] ${serviceName}: selling=${analysisResult.dataSelling}, aiTraining=${analysisResult.aiTraining}, deleteDifficulty=${analysisResult.deleteDifficulty}`);
			return analysisResult;
		}

		// Fall back to Claude if Gemini fails
		if (claudeKey) {
			console.warn("Gemini failed after retries; falling back to Claude");
			return await analyzePrivacyPolicyWithClaude(serviceName, policyText, claudeKey);
		}

		return null;
		return analysisResult;
	} catch (error) {
		console.error(`Gemini analysis error for ${serviceName}:`, error);
		const claudeKey = env.ANTHROPIC_API_KEY;
		if (claudeKey) {
			console.warn("Gemini error; falling back to Claude");
			return await analyzePrivacyPolicyWithClaude(serviceName, policyText, claudeKey);
		}
		return null;
	}
}

async function analyzePrivacyPolicyWithClaude(
	serviceName: string,
	policyText: string,
	apiKey: string,
): Promise<PolicyAnalysis | null> {
	try {
		const prompt = `You are a privacy policy analyst specializing in data privacy risks. Analyze the following privacy policy for ${serviceName}.

Based on the actual policy text, rate on a scale of 1-10 where 1 is least concerning and 10 is most concerning:

1. **Data Selling Risk**: Does the company sell, share, or license user data to third parties for profit? (1=never sells data, 10=actively monetizes all user data)
2. **AI Training Risk**: Does the company use user data to train AI/ML models? (1=never uses for AI training, 10=heavily trains AI models on user data)
3. **Deletion Difficulty**: How hard/long is it to delete your account and all personal data? (1=very easy, instant deletion, 10=nearly impossible, prolonged data retention)

Be objective and base ratings only on what the policy explicitly states or clearly implies. If a practice is not mentioned, assume neutral (around 5).

Respond with ONLY valid JSON (no markdown, no code blocks, no explanations):
{
  "dataSelling": <number 1-10>,
  "aiTraining": <number 1-10>,
  "deleteDifficulty": <number 1-10>,
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

		const response = await fetch("https://api.anthropic.com/v1/messages", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": apiKey,
				"anthropic-version": "2023-06-01",
			},
			body: JSON.stringify({
				model: "claude-3-5-haiku-latest",
				max_tokens: 700,
				temperature: 0.2,
				messages: [{ role: "user", content: prompt }],
			}),
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error(`Claude API error (${response.status}):`, errorText);
			return null;
		}

		const data = await response.json();
		const content = data.content?.[0]?.text;

		if (!content) {
			console.error("No content in Claude response");
			return null;
		}

		const parsed = extractJSON<any>(content);
		if (!parsed) {
			console.error("Could not extract JSON from Claude response:", content.substring(0, 200));
			return null;
		}

		const analysisResult = {
			dataSelling: Math.max(1, Math.min(10, parseInt(parsed.dataSelling) || 5)),
			aiTraining: Math.max(1, Math.min(10, parseInt(parsed.aiTraining) || 5)),
			deleteDifficulty: Math.max(
				1,
				Math.min(10, parseInt(parsed.deleteDifficulty) || 5),
			),
			summary:
				parsed.summary ||
				`Privacy analysis for ${serviceName} based on policy review.`,
			deletionInfo: normalizeDeletionInfo(parsed.deletionInfo, "unknown.com", policyText),
		};
		
		console.log(`[Claude Analysis] ${serviceName}: selling=${analysisResult.dataSelling}, aiTraining=${analysisResult.aiTraining}, deleteDifficulty=${analysisResult.deleteDifficulty}`);
		return analysisResult;
	} catch (error) {
		console.error(`Claude analysis error for ${serviceName}:`, error);
		return null;
	}
}

/**
 * Wait for rate limit to pass for a given provider
 */
async function waitForRateLimit(
	provider: "gemini" | "claude",
): Promise<void> {
	let lastTime = 0;
	let limit = 0;

	if (provider === "gemini") {
		lastTime = lastGeminiRequestTime;
		limit = GEMINI_RATE_LIMIT_MS;
	} else if (provider === "claude") {
		lastTime = lastClaudeRequestTime;
		limit = CLAUDE_RATE_LIMIT_MS;
	}

	const elapsed = Date.now() - lastTime;
	if (elapsed < limit) {
		await new Promise((resolve) => setTimeout(resolve, limit - elapsed));
	}

	// Update last request time
	if (provider === "gemini") {
		lastGeminiRequestTime = Date.now();
	} else if (provider === "claude") {
		lastClaudeRequestTime = Date.now();
	}
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

		// Fallback to Claude if Gemini fails
		const claudeKey = env.ANTHROPIC_API_KEY;
		if (claudeKey) {
			await waitForRateLimit("claude");
			console.log(`[Batch Analysis] Attempting Claude with timeout=${LLM_TIMEOUT_MS}ms and ${LLM_MAX_RETRIES} retries`);
			const claudeResult = await retryWithBackoff(
				() => batchAnalyzeWithClaude(nonCachedPolicies, claudeKey),
				LLM_MAX_RETRIES
			);
			if (claudeResult) {
				// Merge cached results
				const allCached = COMMON_COMPANY_CACHE;
				const result: Record<string, PolicyAnalysis> = {
					...claudeResult,
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

		console.warn("No LLM providers available for batch analysis - using cached data only");
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

Respond with ONLY valid JSON array (one object per policy analyzed, matching the input order):
[
  {
    "domain": "example1.com",
    "dataSelling": <number 1-10>,
    "aiTraining": <number 1-10>,
    "deleteDifficulty": <number 1-10>,
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
			`https://generativelanguage.googleapis.com/v1beta/models/gemma-3-12b-it:generateContent?key=${apiKey}`,
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
						maxOutputTokens: 2000,
					},
				}),
			},
		);

		if (!response.ok) {
			console.error(`Gemini batch API error (${response.status})`);
			const errorText = await response.text();
			console.error("Error response:", errorText);
			console.error(`API URL used: https://generativelanguage.googleapis.com/v1beta/models/gemma-3-12b-it:generateContent`);
			return null;
		}

		const data = await response.json();
		const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

		if (!content) {
			console.error("No content in Gemini batch response");
			return null;
		}

		const parsed = extractJSON<any[]>(content);
		if (!Array.isArray(parsed)) {
			console.error("Could not extract JSON array from response:", content.substring(0, 200));
			return null;
		}

		const result: Record<string, PolicyAnalysis> = {};

		for (const item of parsed) {
			if (item && item.domain) {
				const matchedPolicy = policies.find((p) => p.domain === item.domain);
				result[item.domain] = {
					dataSelling: Math.max(1, Math.min(10, parseInt(item.dataSelling) || 5)),
					aiTraining: Math.max(1, Math.min(10, parseInt(item.aiTraining) || 5)),
					deleteDifficulty: Math.max(
						1,
						Math.min(10, parseInt(item.deleteDifficulty) || 5),
					),
					summary: item.summary || "Privacy analysis based on policy review.",
					deletionInfo: normalizeDeletionInfo(
						item.deletionInfo,
						item.domain,
						matchedPolicy?.policyText || null,
					),
				};
				console.log(`[Gemini Batch] ${item.domain}: selling=${result[item.domain].dataSelling}, aiTraining=${result[item.domain].aiTraining}, deleteDifficulty=${result[item.domain].deleteDifficulty}`);
			}
		}

		return result;
	} catch (error) {
		console.error("Gemini batch analysis error:", error);
		return null;
	}
}

/**
 * Batch analyze using Anthropic Claude
 */
async function batchAnalyzeWithClaude(
	policies: Array<{
		serviceName: string;
		domain: string;
		policyText: string;
	}>,
	apiKey: string,
): Promise<Record<string, PolicyAnalysis> | null> {
	try {
		const policiesText = policies
			.map(
				(p, i) => `
POLICY ${i + 1}: ${p.serviceName} (${p.domain})
${p.policyText.substring(0, 2000)}
---`,
			)
			.join("\n");

		const response = await fetch("https://api.anthropic.com/v1/messages", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": apiKey,
				"anthropic-version": "2023-06-01",
			},
			body: JSON.stringify({
				model: "claude-3-5-haiku-latest",
				max_tokens: 2000,
				temperature: 0.2,
				messages: [
					{
						role: "user",
						content: `You are a privacy policy analyst. Analyze policies and rate privacy risks 1-10.

Return ONLY valid JSON array. Each item must include:
- domain
- dataSelling (1-10)
- aiTraining (1-10)
- deleteDifficulty (1-10)
- summary
- deletionInfo: {
    availability: available|limited|unknown,
    accountDeletionUrl: absolute https URL or null,
    dataDeletionUrl: absolute https URL or null,
    retentionWindow: short string or null,
    instructions: clear user-facing steps
  }

Policies:\n${policiesText}`,
					},
				],
			}),
		});

		if (!response.ok) {
			console.error(`Claude batch API error (${response.status})`);
			return null;
		}

		const data = await response.json();
		const content = data.content?.[0]?.text;

		if (!content) {
			console.error("No content in Claude batch response");
			return null;
		}

		const parsed = extractJSON<any[]>(content);
		if (!Array.isArray(parsed)) {
			console.error("Could not extract JSON array from Claude response:", content.substring(0, 200));
			return null;
		}

		const result: Record<string, PolicyAnalysis> = {};

		for (const item of parsed) {
			if (item && item.domain) {
				const matchedPolicy = policies.find((p) => p.domain === item.domain);
				result[item.domain] = {
					dataSelling: Math.max(1, Math.min(10, parseInt(item.dataSelling) || 5)),
					aiTraining: Math.max(1, Math.min(10, parseInt(item.aiTraining) || 5)),
					deleteDifficulty: Math.max(
						1,
						Math.min(10, parseInt(item.deleteDifficulty) || 5),
					),
					summary: item.summary || "Privacy analysis based on policy review.",
					deletionInfo: normalizeDeletionInfo(
						item.deletionInfo,
						item.domain,
						matchedPolicy?.policyText || null,
					),
				};
			}
		}

		return result;
	} catch (error) {
		console.error("Claude batch analysis error:", error);
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
