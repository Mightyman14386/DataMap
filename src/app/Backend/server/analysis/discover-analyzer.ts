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

const DEFAULT_POLICY_ANALYSIS = {
	dataSelling: 5,
	aiTraining: 5,
	deleteDifficulty: 5,
	summary: "Privacy policy analysis unavailable.",
};

function normalizeDomain(domain: string): string {
	return domain.trim().toLowerCase();
}

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

	for (let batchStart = 0; batchStart < services.length; batchStart += batchSize) {
		const rawBatch = services.slice(batchStart, batchStart + batchSize);
		const batchNum = Math.floor(batchStart / batchSize) + 1;
		console.log(`[Discover Analyzer] Batch ${batchNum}: processing ${rawBatch.length} services`);

		const batch = rawBatch.map((serviceInput) => ({
			...serviceInput,
			normalizedDomain: normalizeDomain(serviceInput.domain),
			trimmedServiceName: serviceInput.serviceName.trim(),
			lastUsedAtDate: serviceInput.lastUsedAt ? new Date(serviceInput.lastUsedAt) : undefined,
		}));

		const uniqueByDomain = new Map<string, typeof batch[number]>();
		for (const service of batch) {
			if (!uniqueByDomain.has(service.normalizedDomain)) {
				uniqueByDomain.set(service.normalizedDomain, service);
			}
		}

		const uniqueServices = Array.from(uniqueByDomain.values());
		const policiesToFetch = uniqueServices
			.filter((s) => !COMMON_COMPANY_CACHE[s.normalizedDomain])
			.map((s) => ({ serviceName: s.trimmedServiceName, domain: s.normalizedDomain }));

		const policyTextMap: Record<string, string> = {};
		const breachCheckMap: Record<string, any> = {};

		await Promise.all([
			Promise.all(
				policiesToFetch.map(async (p) => {
					try {
						const text = await fetchPrivacyPolicyText(p.domain);
						if (text) policyTextMap[p.domain] = text;
					} catch (err) {
						console.warn(`[Discover Analyzer] Policy fetch failed for ${p.domain}:`, err);
					}
				}),
			),
			Promise.all(
				uniqueServices.map(async (s) => {
					try {
						const breach = await checkDataBreach(s.normalizedDomain);
						breachCheckMap[s.normalizedDomain] = breach;
					} catch (err) {
						console.warn(`[Discover Analyzer] Breach check failed for ${s.normalizedDomain}:`, err);
					}
				}),
			),
		]);

		const policiesToAnalyze = policiesToFetch
			.filter((p) => policyTextMap[p.domain])
			.map((p) => ({
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

		for (const serviceInput of batch) {
			const normalizedDomain = serviceInput.normalizedDomain;
			const lastUsedAt = serviceInput.lastUsedAtDate;

			try {
				const analysis = batchAnalysisResults[normalizedDomain];
				const isDataUnavailable = !analysis && !policyTextMap[normalizedDomain];

				if (isDataUnavailable) {
					console.log(`[Discover Analyzer] No policy for ${serviceInput.trimmedServiceName} (${normalizedDomain})`);
				}

				const policyScores = analysis || DEFAULT_POLICY_ANALYSIS;

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
					serviceName: serviceInput.trimmedServiceName,
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
