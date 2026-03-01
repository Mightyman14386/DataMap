import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "~/app/Backend/server/auth";
import {
	upsertDiscoveredService,
	saveRiskResult,
} from "~/app/Backend/Firebase/firebase-db";
import { scoreServiceRisk } from "~/app/Backend/server/risk/engine";
import {
	analyzePrivacyPolicy,
	batchAnalyzePrivacyPolicies,
	checkDataBreach,
	fetchPrivacyPolicyText,
	getDeletionInfoForService,
} from "~/app/Backend/server/privacy/analysis-service";

const discoverAnalyzeRequestSchema = z.object({
	services: z.array(
		z.object({
			serviceName: z.string().min(1),
			domain: z.string().min(1),
			discoveredVia: z.string().optional(),
			lastUsedAt: z.string().datetime().optional(),
		}),
	),
	persist: z.boolean().optional().default(true),
});

export async function POST(request: Request) {
	const session = await auth();
	const userId = session?.user?.id;

	const parsed = discoverAnalyzeRequestSchema.safeParse(await request.json());
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "Invalid request body", issues: parsed.error.flatten() },
			{ status: 400 },
		);
	}

	const body = parsed.data;

	if (body.persist && !userId) {
		return NextResponse.json(
			{ error: "Unauthorized for persist=true" },
			{ status: 401 },
		);
	}

	const results = [];
	const tierCounts = { red: 0, yellow: 0, green: 0 };

	// Phase 1: Collect services that need policy fetching (not in built-in cache)
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

	const policiesToFetch: Array<{ index: number; serviceName: string; domain: string }> = [];

	for (let i = 0; i < body.services.length; i++) {
		const service = body.services[i];
		if (!service) continue;
		const normalizedDomain = service.domain.trim().toLowerCase();
		if (!COMMON_COMPANY_CACHE[normalizedDomain]) {
			policiesToFetch.push({
				index: i,
				serviceName: service.serviceName,
				domain: normalizedDomain,
			});
		}
	}

	// Phase 2: Batch fetch all policies at once (more efficient than one at a time)
	const policyTextMap: Record<string, string> = {};
	for (const policyRequest of policiesToFetch) {
		const text = await fetchPrivacyPolicyText(policyRequest.domain);
		if (text) {
			policyTextMap[policyRequest.domain] = text;
		}
	}

	// Phase 3: Batch analyze all non-cached policies in chunks (Gemini friendly)
	const policiesToAnalyze = policiesToFetch
		.filter((p) => policyTextMap[p.domain])
		.map((p) => ({
			serviceName: p.serviceName,
			domain: p.domain,
			policyText: policyTextMap[p.domain] || "",
		}))
		.filter((p) => p.policyText.length > 0);

	const batchAnalysisResults = policiesToAnalyze.length > 0 
		? await batchAnalyzePrivacyPolicies(policiesToAnalyze)
		: {};

	// Phase 4: Batch check breaches for all services (parallel)
	const breachCheckMap = await Promise.all(
		body.services.map((service) =>
			checkDataBreach(service.domain.toLowerCase().trim()).then((breach) => ({
				domain: service.domain.toLowerCase().trim(),
				breach,
			})),
		),
	).then((results) =>
		results.reduce(
			(map, { domain, breach }) => {
				map[domain] = breach;
				return map;
			},
			{} as Record<string, typeof results[0]["breach"]>,
		),
	);

	// Phase 5: Process each discovered service with all analyzed data
	for (const serviceInput of body.services) {
		const normalizedDomain = serviceInput.domain.trim().toLowerCase();
		const lastUsedAt = serviceInput.lastUsedAt
			? new Date(serviceInput.lastUsedAt)
			: undefined;

		try {
			// Get analysis from batch results or cache
			const analysis =
				batchAnalysisResults[normalizedDomain] ||
				(await analyzePrivacyPolicy(
					serviceInput.serviceName,
					"",
					normalizedDomain,
				));

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

			// Get cached breach info
			const breachInfo = breachCheckMap[normalizedDomain] || {
				wasBreached: false,
				breachCheckStatus: "unavailable" as const,
			};

			// Score the risk
			const risk = scoreServiceRisk({
				serviceName: serviceInput.serviceName.trim(),
				domain: normalizedDomain,
				policy: policyScores,
				breach: breachInfo,
				usage: lastUsedAt ? { lastUsedAt } : {},
			});

			tierCounts[risk.tier]++;

			if (!body.persist || !userId) {
				results.push({
					service: {
						serviceName: serviceInput.serviceName,
						domain: normalizedDomain,
					},
					risk,
					policyAnalysis: policyScores,
					deletionInfo,
					breachInfo,
				});
				continue;
			}

			// Persist to database
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

			results.push({
				service: {
					id: serviceId,
					serviceName: serviceInput.serviceName,
					domain: normalizedDomain,
				},
				risk: {
					...risk,
					id: riskId,
					scoredAt: new Date(),
				},
				policyAnalysis: policyScores,
				deletionInfo,
				breachInfo,
			});
		} catch (error) {
			results.push({
				service: {
					serviceName: serviceInput.serviceName,
					domain: normalizedDomain,
				},
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	}

	// Sort by delete priority descending
	results.sort((a, b) => {
		const aPriority = a.risk?.deletePriority ?? 0;
		const bPriority = b.risk?.deletePriority ?? 0;
		return bPriority - aPriority;
	});

	return NextResponse.json(
		{
			count: results.length,
			summary: tierCounts,
			results,
		},
		{ status: 200 },
	);
}
