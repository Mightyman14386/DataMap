/**
 * Privacy Engine Client - Frontend utility functions
 * Provides easy-to-use functions for the frontend to interact with the LLM analysis engine
 */

/**
 * Risk tier type
 */
export type RiskTier = "red" | "yellow" | "green";

/**
 * Service with its risk analysis
 */
export interface AnalyzedService {
	service: {
		id?: string;
		serviceName: string;
		domain: string;
	};
	risk: {
		id?: string;
		serviceName: string;
		domain: string;
		score: number; // 0-100
		tier: RiskTier;
		reasons: string[];
		deletePriority?: number;
		scoredAt?: Date;
	};
	policyAnalysis: {
		dataSelling: number; // 1-10
		aiTraining: number; // 1-10
		deleteDifficulty: number; // 1-10
		summary: string;
	};
	deletionInfo?: {
		availability: "available" | "limited" | "unknown";
		accountDeletionUrl?: string;
		dataDeletionUrl?: string;
		retentionWindow?: string;
		instructions: string;
		source: "llm" | "heuristic" | "default";
	};
	breachInfo: {
		wasBreached: boolean;
		breachName?: string;
		breachYear?: number;
		breachCheckStatus?: "ok" | "rate_limited" | "unavailable";
	};
	error?: string;
}

/**
 * Analysis result summary
 */
export interface AnalysisResult {
	count: number;
	summary: {
		red: number;
		yellow: number;
		green: number;
	};
	results: AnalyzedService[];
}

/**
 * Discovered service to be analyzed
 */
export interface DiscoveredServiceInput {
	serviceName: string;
	domain: string;
	discoveredVia?: string;
	lastUsedAt?: string; // ISO 8601 datetime
}

/**
 * Backend API configuration
 */
let apiConfig = {
	baseUrl: "/api",
	authToken: "",
};

/**
 * Configure the API client
 */
export function configurePrivacyEngine(config: {
	baseUrl?: string;
	authToken?: string;
}) {
	if (config.baseUrl) apiConfig.baseUrl = config.baseUrl;
	if (config.authToken) apiConfig.authToken = config.authToken;
}

/**
 * Set authentication token for API calls
 */
export function setAuthToken(token: string) {
	apiConfig.authToken = token;
}

/**
 * Fetch headers with authentication
 */
function getHeaders(): HeadersInit {
	return {
		"Content-Type": "application/json",
		...(apiConfig.authToken && {
			Authorization: `Bearer ${apiConfig.authToken}`,
		}),
	};
}

/**
 * Analyze discovered services (end-to-end)
 * This is the main entry point after email scanning
 */
export async function analyzeServices(
	services: DiscoveredServiceInput[],
	options?: {
		persist?: boolean; // Save to database
		baseUrl?: string;
	},
): Promise<AnalysisResult> {
	const url = `${options?.baseUrl || apiConfig.baseUrl}/discover/analyze`;

	const response = await fetch(url, {
		method: "POST",
		headers: getHeaders(),
		body: JSON.stringify({
			services,
			persist: options?.persist ?? true,
		}),
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || `API error: ${response.status}`);
	}

	return await response.json();
}

/**
 * Analyze a single service's policy
 */
export async function analyzePolicy(
	serviceName: string,
	domain: string,
): Promise<{
	dataSelling: number;
	aiTraining: number;
	deleteDifficulty: number;
	summary: string;
	deletionInfo?: {
		availability: "available" | "limited" | "unknown";
		accountDeletionUrl?: string;
		dataDeletionUrl?: string;
		retentionWindow?: string;
		instructions: string;
		source: "llm" | "heuristic" | "default";
	};
	source: "cache" | "llm" | "default";
	analyzedAt: Date;
}> {
	const url = `${apiConfig.baseUrl}/policy/analyze`;

	const response = await fetch(url, {
		method: "POST",
		headers: getHeaders(),
		body: JSON.stringify({
			serviceName,
			domain,
		}),
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || `API error: ${response.status}`);
	}

	return await response.json();
}

/**
 * Check if a domain was in a breach
 */
export async function checkBreach(domain: string): Promise<{
	wasBreached: boolean;
	breachName?: string;
	breachYear?: number;
	breachCheckStatus?: "ok" | "rate_limited" | "unavailable";
}> {
	const url = `${apiConfig.baseUrl}/breach/check?domain=${encodeURIComponent(
		domain,
	)}`;

	const response = await fetch(url, {
		headers: getHeaders(),
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || `API error: ${response.status}`);
	}

	return await response.json();
}

/**
 * Score a service with pre-analyzed policy data
 */
export async function scoreService(data: {
	serviceName: string;
	domain: string;
	policy: {
		dataSelling: number;
		aiTraining: number;
		deleteDifficulty: number;
		summary?: string;
	};
	breach: {
		wasBreached: boolean;
		breachName?: string;
		breachYear?: number;
		breachCheckStatus?: "ok" | "rate_limited" | "unavailable";
	};
	usage: {
		lastUsedAt?: string;
	};
	persist?: boolean;
}): Promise<{
	risk: any;
	service?: { id: string };
}> {
	const url = `${apiConfig.baseUrl}/risk/score`;

	const response = await fetch(url, {
		method: "POST",
		headers: getHeaders(),
		body: JSON.stringify(data),
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || `API error: ${response.status}`);
	}

	return await response.json();
}

/**
 * Get all services for the current user
 */
export async function getUserServices(): Promise<AnalysisResult> {
	const url = `${apiConfig.baseUrl}/risk/score/batch`;

	const response = await fetch(url, {
		headers: getHeaders(),
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || `API error: ${response.status}`);
	}

	return await response.json();
}

/**
 * Get services sorted by delete priority
 */
export async function getPrioritizedDeleteList(): Promise<AnalyzedService[]> {
	const result = await getUserServices();
	// Filter out errors and sort by delete priority
	return result.results
		.filter((s): s is AnalyzedService => !s.error)
		.sort(
			(a, b) =>
				(b.risk.deletePriority || 0) - (a.risk.deletePriority || 0),
		);
}

/**
 * Get services by tier
 */
export async function getServicesByTier(tier: RiskTier): Promise<AnalyzedService[]> {
	const result = await getUserServices();
	return result.results.filter(
		(s): s is AnalyzedService => !s.error && s.risk.tier === tier,
	);
}

/**
 * Get statistics about services
 */
export async function getServiceStats(): Promise<{
	total: number;
	byTier: Record<RiskTier, number>;
	averageScore: number;
	highestRisk?: AnalyzedService;
}> {
	const result = await getUserServices();
	const validServices = result.results.filter(
		(s): s is AnalyzedService => !s.error,
	);

	const averageScore =
		validServices.length > 0
			? validServices.reduce((sum, s) => sum + s.risk.score, 0) /
				validServices.length
			: 0;

	const highestRisk = validServices.reduce((max, s) =>
		s.risk.score > (max?.risk.score || 0) ? s : max,
	);

	return {
		total: validServices.length,
		byTier: result.summary,
		averageScore: Math.round(averageScore),
		highestRisk,
	};
}

/**
 * Format a score as a visual representation
 */
export function formatRiskScore(score: number): string {
	if (score >= 70) return "🔴 CRITICAL";
	if (score >= 40) return "🟡 WARNING";
	return "🟢 SAFE";
}

/**
 * Get color for a tier
 */
export function getTierColor(tier: RiskTier): string {
	switch (tier) {
		case "red":
			return "#FF003C"; // Threat Red
		case "yellow":
			return "#FFB000"; // Caution Yellow
		case "green":
			return "#00FF41"; // Matrix Green
	}
}

/**
 * Extract domain from email address
 */
export function extractDomainFromEmail(email: string): string | null {
	const match = email.match(/@([a-zA-Z0-9.-]+)/);
	return match?.[1] ?? null;
}

/**
 * Convert discovered services from email scanning results
 */
export function convertEmailsToServices(
	emails: Array<{
		subject: string;
		from: string;
		date?: string;
	}>,
): DiscoveredServiceInput[] {
	const services: DiscoveredServiceInput[] = [];
	const seen = new Set<string>();

	// Extract company names from welcome/verification emails
	const companyPatterns = [
		/welcome to ([a-z0-9\s]+)/i,
		/(?:verify|confirm) your ([a-z0-9\s]+) account/i,
		/request authorization [a-z0-9 ]+ at ([a-z0-9\s]+)/i,
	];

	for (const email of emails) {
		const domain = extractDomainFromEmail(email.from);
		if (!domain || seen.has(domain)) continue;

		let serviceName = domain.replace(/\.(com|org|io|co|net)$/, "");

		// Try to extract better service name from subject
		for (const pattern of companyPatterns) {
			const match = email.subject.match(pattern);
			if (match?.[1]) {
				serviceName = match[1].trim();
				break;
			}
		}

		services.push({
			serviceName,
			domain,
			discoveredVia: "email",
			...(email.date && { lastUsedAt: new Date(email.date).toISOString() }),
		});

		seen.add(domain);
	}

	return services;
}
