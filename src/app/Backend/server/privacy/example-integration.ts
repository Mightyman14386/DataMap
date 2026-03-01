/**
 * Example integration guide for the privacy engine
 * Shows how to use the LLM analysis pipeline end-to-end
 */

import {
	analyzeServices,
	getUserServices,
	getServiceStats,
	getPrioritizedDeleteList,
	configurePrivacyEngine,
	type DiscoveredServiceInput,
} from "./client";

/**
 * MAIN INTEGRATION FLOW
 * =====================
 *
 * This is how the complete system works:
 *
 * 1. USER LOGS IN WITH GOOGLE
 *    └─ Frontend authenticates user via NextAuth
 *    └─ Gets access token for Gmail API
 *
 * 2. EMAIL SCANNING
 *    └─ Someone else: Scans Gmail for signup/verification emails
 *    └─ Extracts service domains and names
 *    └─ Passes to analyzeServices()
 *
 * 3. POLICY ANALYSIS (THIS IS THE LLM ENGINE)
 *    └─ Fetches privacy policy from each domain
 *    └─ Sends policy text to Google Gemini via LLM
 *    └─ Gets ratings: dataSelling (1-10), aiTraining (1-10), deleteDifficulty (1-10)
 *
 * 4. BREACH CHECKING
 *    └─ Checks HaveIBeenPwned for each domain
 *    └─ Detects historical breaches
 *
 * 5. RISK SCORING
 *    └─ Combines policy ratings with breach history
 *    └─ Calculates overall risk score (0-100)
 *    └─ Assigns tier: RED | YELLOW | GREEN
 *
 * 6. DATABASE PERSISTENCE
 *    └─ Saves to Firestore
 *    └─ Caches results for future use
 *
 * 7. FRONTEND DISPLAYS RESULTS
 *    └─ Risk quadrants/map visualization
 *    └─ Prioritized delete list
 *    └─ Links to account settings pages
 */

/**
 * Example: How the frontend would call the analysis engine
 */
export async function exampleFrontendIntegration() {
	// Step 1: Configure the client with auth token
	const userToken = "jwt_token_from_nextauth";
	configurePrivacyEngine({
		baseUrl: "/api",
		authToken: userToken,
	});

	// Step 2: After email scanning, discovered services would look like:
	const discoveredServices: DiscoveredServiceInput[] = [
		{
			serviceName: "Google",
			domain: "google.com",
			discoveredVia: "gmail_signup",
			lastUsedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
		},
		{
			serviceName: "GitHub",
			domain: "github.com",
			discoveredVia: "email_verification",
			lastUsedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
		},
		{
			serviceName: "OpenAI",
			domain: "openai.com",
			discoveredVia: "account_confirmation",
			lastUsedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
		},
	];

	// Step 3: Analyze all services at once
	// This triggers the entire LLM/breach checking pipeline
	const results = await analyzeServices(discoveredServices, {
		persist: true, // Save to user's database
	});

	console.log("Analysis Complete!");
	console.log(`Total Services: ${results.count}`);
	console.log(`Red (Critical): ${results.summary.red}`);
	console.log(`Yellow (Warning): ${results.summary.yellow}`);
	console.log(`Green (Safe): ${results.summary.green}`);

	// Step 4: Get prioritized list for deletion
	const deleteList = await getPrioritizedDeleteList();
	console.log("\nServices to delete (by priority):");
	for (const service of deleteList.slice(0, 5)) {
		console.log(
			`${service.risk.tier.toUpperCase()}: ${service.service.serviceName} (Priority: ${service.risk.deletePriority})`,
		);
	}

	// Step 5: Get stats for dashboard
	const stats = await getServiceStats();
	console.log("\nDashboard Stats:");
	console.log(`Total Services: ${stats.total}`);
	console.log(`Average Risk Score: ${stats.averageScore}%`);
	console.log(`Highest Risk: ${stats.highestRisk?.service.serviceName}`);
}

/**
 * API ENDPOINTS REFERENCE
 * ======================
 */
export const API_ENDPOINTS = {
	/**
	 * POST /api/discover/analyze
	 * Full end-to-end analysis: fetch policy, analyze with Gemini, check breach, score
	 *
	 * Request:
	 * {
	 *   "services": [
	 *     {
	 *       "serviceName": "GitHub",
	 *       "domain": "github.com",
	 *       "lastUsedAt": "2024-02-28T12:00:00Z"
	 *     }
	 *   ],
	 *   "persist": true
	 * }
	 *
	 * Response:
	 * {
	 *   "count": 1,
	 *   "summary": { "red": 0, "yellow": 1, "green": 0 },
	 *   "results": [
	 *     {
	 *       "service": { "id": "...", "serviceName": "GitHub", "domain": "github.com" },
	 *       "risk": {
	 *         "score": 45,
	 *         "tier": "yellow",
	 *         "reasons": ["Policy indicates AI-training data use"],
	 *         "deletePriority": 30
	 *       },
	 *       "policyAnalysis": {
	 *         "dataSelling": 4,
	 *         "aiTraining": 6,
	 *         "deleteDifficulty": 3,
	 *         "summary": "GitHub's policy shows moderate AI model training use..."
	 *       },
	 *       "breachInfo": {
	 *         "wasBreached": true,
	 *         "breachName": "GitHub 2020",
	 *         "breachYear": 2020
	 *       }
	 *     }
	 *   ]
	 * }
	 */
	discoverAnalyze: "/api/discover/analyze",

	/**
	 * POST /api/policy/analyze
	 * Analyze just the privacy policy (cached)
	 */
	policyAnalyze: "/api/policy/analyze",

	/**
	 * GET /api/breach/check?domain=github.com
	 * Check if domain was in a breach
	 */
	breachCheck: "/api/breach/check",

	/**
	 * POST /api/risk/score
	 * Score a single service (with pre-analyzed policy data)
	 */
	riskScore: "/api/risk/score",

	/**
	 * POST /api/risk/score/batch
	 * Batch score multiple services (requires all analysis data)
	 *
	 * GET /api/risk/score/batch
	 * Get all services for current user (requires auth)
	 */
	riskScoreBatch: "/api/risk/score/batch",
};

/**
 * DATA MODELS
 * ===========
 */
export interface PolicyAnalysisResult {
	dataSelling: number; // 1-10: Does the company sell user data?
	aiTraining: number; // 1-10: Does the company use data for AI training?
	deleteDifficulty: number; // 1-10: How hard is it to delete your account?
	summary: string; // 2-sentence summary of key concerns
	deletionInfo?: {
		availability: "available" | "limited" | "unknown";
		accountDeletionUrl?: string;
		dataDeletionUrl?: string;
		retentionWindow?: string;
		instructions: string;
		source: "llm" | "heuristic" | "default";
	};
}

export interface BreachCheckResult {
	wasBreached: boolean;
	breachName?: string;
	breachYear?: number;
	breachCheckStatus?: "ok" | "rate_limited" | "unavailable";
}

export interface RiskScoreResult {
	serviceName: string;
	domain: string;
	score: number; // 0-100
	tier: "red" | "yellow" | "green";
	reasons: string[]; // Why this score?
	deletePriority?: number; // Higher = delete first
}

/**
 * GEMINI PROMPT REFERENCE
 * =======================
 *
 * The LLM engine sends this prompt to Google Gemini:
 *
 * ```
 * You are a privacy policy analyst. Analyze the following privacy policy for [SERVICE].
 *
 * Rate on a scale of 1-10 where 1 is least concerning and 10 is most concerning:
 *
 * 1. Data Selling: Does the company sell user data to third parties?
 * 2. AI Training: Does the company use user data to train AI/ML models?
 * 3. Deletion Difficulty: How hard is it to delete your account and data?
 *
 * Be objective and factual. Check what the policy actually says.
 *
 * Respond with ONLY valid JSON:
 * {
 *   "dataSelling": <number 1-10>,
 *   "aiTraining": <number 1-10>,
 *   "deleteDifficulty": <number 1-10>,
 *   "summary": "<2-sentence factual summary>"
 * }
 *
 * [Privacy Policy Text]
 * ```
 */

/**
 * RISK SCORING FORMULA
 * ====================
 *
 * The engine combines multiple factors to calculate final risk:
 *
 * Policy Score = (dataSelling × 2.5) + (aiTraining × 1.8) + (deleteDifficulty × 1.7)
 * Breach Score = 20 (if breached) + 5 (if older breach)
 * Staleness Score = 5 + (years-2) × 3 (if unused 2+ years)
 *
 * Final Score = Clamp(PolicyScore + BreachScore + StalenessScore, 0, 100)
 *
 * Tier Assignment:
 * - RED (Critical): Score ≥ 70
 * - YELLOW (Warning): Score 40-69
 * - GREEN (Safe): Score < 40
 */

export const RATING_SCALES = {
	dataSelling: {
		1: "Company never sells user data",
		5: "Unclear policy on data selling",
		10: "Company actively monetizes all user data",
	},
	aiTraining: {
		1: "No AI/ML model training on user data",
		5: "Limited or unclear AI training practices",
		10: "Heavily trains AI models on all user-generated content",
	},
	deleteDifficulty: {
		1: "Account deletion is instant and easy",
		5: "Standard deletion process but with data retention",
		10: "Deletion is nearly impossible with indefinite data retention",
	},
};
