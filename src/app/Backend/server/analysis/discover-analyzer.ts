/**
 * Core analysis logic for discovered services
 * Can be imported and used by any route or service
 */

import {
	upsertDiscoveredService,
	saveRiskResult,
	saveDeletionInfo,
} from "~/app/Backend/Firebase/firebase-db";
import { scoreServiceRisk } from "~/app/Backend/server/risk/engine";
import {
	analyzePrivacyPolicy,
	batchAnalyzePrivacyPolicies,
	checkDataBreach,
	fetchPrivacyPolicyText,
	getDeletionInfoForService,
} from "~/app/Backend/server/privacy/analysis-service";

export interface DiscoveredServiceInput {
	serviceName: string;
	domain: string;
	discoveredVia?: string;
	lastUsedAt?: string; // ISO 8601 datetime
}

export interface AnalyzedResult {
	service: {
		id?: string;
		serviceName: string;
		domain: string;
	};
	risk?: any;
	policyAnalysis?: any;
	deletionInfo?: any;
	breachInfo?: any;
	error?: string;
}

export interface AnalysisOutput {
	count: number;
	summary: {
		red: number;
		yellow: number;
		green: number;
		neutral?: number;
	};
	results: AnalyzedResult[];
}

const COMMON_COMPANY_CACHE: Record<string, boolean> = {
	"google.com": true,
	"facebook.com": true,
	"instagram.com": true,
	"tiktok.com": true,
	"linkedin.com": true,
	"amazon.com": true,
	"twitter.com": true,
	"x.com": true,
	"spotify.com": true,
	"dropbox.com": true,
	"apple.com": true,
	"microsoft.com": true,
	"github.com": true,
	"openai.com": true,
	"reddit.com": true,
	"discord.com": true,
	"gmail.com": true,
	"outlook.com": true,
	"youtube.com": true,
};

export async function analyzeDiscoveredServices(
	services: DiscoveredServiceInput[],
	options: {
		persist?: boolean;
		userId?: string;
		batchSize?: number;
	} = {}
): Promise<AnalysisOutput> {
	const { persist = false, userId, batchSize = 10 } = options;
	const results: AnalyzedResult[] = [];
	const tierCounts = { red: 0, yellow: 0, green: 0, neutral: 0 };

	// Process services in batches — each batch fully completes (policy + LLM + breach + write)
	// before moving to the next, so Firestore gets data every batchSize services
	for (let batchStart = 0; batchStart < services.length; batchStart += batchSize) {
		const batch = services.slice(batchStart, batchStart + batchSize);
		const batchNum = Math.floor(batchStart / batchSize) + 1;
		console.log(`[Discover Analyzer] Batch ${batchNum}: processing ${batch.length} services`);

		// Phase 1: Which services in this batch need policy fetching
		const policiesToFetch = batch
			.filter(s => !COMMON_COMPANY_CACHE[s.domain.trim().toLowerCase()])
			.map(s => ({ serviceName: s.serviceName, domain: s.domain.trim().toLowerCase() }));

		// Phase 2: Fetch policies for this batch in parallel
		const policyTextMap: Record<string, string> = {};
		await Promise.all(
			policiesToFetch.map(async p => {
				try {
					const text = await fetchPrivacyPolicyText(p.domain);
					if (text) policyTextMap[p.domain] = text;
				} catch (err) {
					console.warn(`[Discover Analyzer] Policy fetch failed for ${p.domain}:`, err);
				}
			})
		);

		// Phase 3: Batch LLM analyze for this batch
		const policiesToAnalyze = policiesToFetch
			.filter(p => policyTextMap[p.domain])
			.map(p => ({
				serviceName: p.serviceName,
				domain: p.domain,
				policyText: policyTextMap[p.domain]!,
			}));

		let batchAnalysisResults: Record<string, any> = {};
		if (policiesToAnalyze.length > 0) {
			try {
				batchAnalysisResults = await batchAnalyzePrivacyPolicies(policiesToAnalyze);
			} catch (err) {
				console.warn(`[Discover Analyzer] Batch ${batchNum} LLM failed, using defaults:`, err);
			}
		}

		// Phase 4: Breach check for this batch in parallel
		const breachCheckMap: Record<string, any> = {};
		await Promise.all(
			batch.map(async s => {
				try {
					const breach = await checkDataBreach(s.domain.toLowerCase().trim());
					breachCheckMap[s.domain.toLowerCase().trim()] = breach;
				} catch (err) {
					console.warn(`[Discover Analyzer] Breach check failed for ${s.domain}:`, err);
				}
			})
		);

		// Phase 5: Score and persist each service in this batch
		for (const serviceInput of batch) {
			const normalizedDomain = serviceInput.domain.trim().toLowerCase();
			const lastUsedAt = serviceInput.lastUsedAt
				? new Date(serviceInput.lastUsedAt)
				: undefined;

			try {
				let analysis = batchAnalysisResults[normalizedDomain];
				let isDataUnavailable = false;

				if (!analysis) {
					if (policyTextMap[normalizedDomain]) {
						const result = await analyzePrivacyPolicy(
							serviceInput.serviceName,
							policyTextMap[normalizedDomain]!,
							normalizedDomain,
						);
						if (result) analysis = result;
					} else {
						isDataUnavailable = true;
						console.log(`[Discover Analyzer] No policy for ${serviceInput.serviceName} (${normalizedDomain})`);
					}
				}

				const policyScores = analysis || {
					dataSelling: 5,
					aiTraining: 5,
					deleteDifficulty: 5,
					summary: "Privacy policy analysis unavailable.",
				};

				const deletionInfo = getDeletionInfoForService(
					normalizedDomain,
					policyTextMap[normalizedDomain] || null,
					analysis || null,
				);

				const breachInfo = breachCheckMap[normalizedDomain] || {
					wasBreached: false,
					breachCheckStatus: "unavailable" as const,
				};

				if (breachInfo.wasBreached) {
					console.log(`[Discover Analyzer] ⚠ BREACH: ${normalizedDomain}: ${breachInfo.breachName} (${breachInfo.breachYear})`);
				} else {
					console.log(`[Discover Analyzer] ✓ No breach: ${normalizedDomain}`);
				}

				const risk = scoreServiceRisk({
					serviceName: serviceInput.serviceName.trim(),
					domain: normalizedDomain,
					policy: policyScores,
					breach: breachInfo,
					usage: lastUsedAt ? { lastUsedAt } : {},
					isDataUnavailable,
				});

				tierCounts[risk.tier]++;

				if (!persist || !userId) {
					results.push({
						service: { serviceName: serviceInput.serviceName, domain: normalizedDomain },
						risk,
						policyAnalysis: policyScores,
						deletionInfo,
						breachInfo,
					});
					continue;
				}

				// Write this service to Firestore immediately
				const serviceId = await upsertDiscoveredService(
					userId,
					risk.serviceName,
					risk.domain,
					lastUsedAt,
				);

				const riskId = await saveRiskResult(
					serviceId,
					policyScores.dataSelling,
					policyScores.aiTraining,
					policyScores.deleteDifficulty,
					policyScores.summary,
					breachInfo.wasBreached,
					breachInfo.breachName,
					breachInfo.breachYear,
					risk.score,
					risk.tier,
					risk.reasons,
				);

				await saveDeletionInfo(
					riskId,
					deletionInfo.availability,
					deletionInfo.accountDeletionUrl,
					deletionInfo.dataDeletionUrl,
					deletionInfo.retentionWindow,
					deletionInfo.instructions,
					deletionInfo.source,
				);

				console.log(`[Discover Analyzer] Saved ${normalizedDomain} (batch ${batchNum})`);

				results.push({
					service: {
						id: serviceId,
						serviceName: serviceInput.serviceName,
						domain: normalizedDomain,
					},
					risk: { ...risk, id: riskId, scoredAt: new Date() },
					policyAnalysis: policyScores,
					deletionInfo,
					breachInfo,
				});
			} catch (error) {
				results.push({
					service: { serviceName: serviceInput.serviceName, domain: normalizedDomain },
					error: error instanceof Error ? error.message : "Unknown error",
				});
			}
		}

		console.log(`[Discover Analyzer] Batch ${batchNum} complete — ${results.length}/${services.length} services written to Firestore`);
	}

	results.sort((a, b) => (b.risk?.deletePriority ?? 0) - (a.risk?.deletePriority ?? 0));

	return { count: results.length, summary: tierCounts, results };
}
