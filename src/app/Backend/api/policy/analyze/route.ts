import { NextResponse } from "next/server";
import { z } from "zod";

import { getPolicyCached, savePolicyCache } from "~/app/Backend/Firebase/firebase-db";
import {
	fetchPrivacyPolicyText,
	analyzePrivacyPolicy,
	getDeletionInfoForService,
} from "~/app/Backend/server/privacy/analysis-service";

const analyzeRequestSchema = z.object({
	serviceName: z.string().min(1),
	domain: z.string().min(1),
});

export async function POST(request: Request) {
	const parsed = analyzeRequestSchema.safeParse(await request.json());
	if (!parsed.success) {
		console.error("[Route] Invalid request body:", parsed.error);
		return NextResponse.json(
			{ error: "Invalid request body" },
			{ status: 400 },
		);
	}

	const { serviceName, domain } = parsed.data;
	const normalizedDomain = domain.trim().toLowerCase();

	console.log(`[Route] Policy analyze request for ${serviceName} (${normalizedDomain})`);

	try {
		// Check cache first (best effort)
		let cached: Awaited<ReturnType<typeof getPolicyCached>> = null;
		try {
			cached = await getPolicyCached(normalizedDomain);
			if (cached) {
				console.log(`[Route] ✓ Found Firebase cache for ${normalizedDomain}`);
			}
		} catch (cacheReadError) {
			console.warn("[Route] Policy cache read failed:", cacheReadError);
		}

		if (cached && cached.dataSelling && cached.aiTraining) {
			const deletionInfo = getDeletionInfoForService(normalizedDomain, null, {
				dataSelling: cached.dataSelling,
				aiTraining: cached.aiTraining,
				deleteDifficulty: cached.deleteDifficulty,
				summary: cached.summary,
			});

			console.log(`[Route] Returning cached result for ${normalizedDomain}`);
			return NextResponse.json(
				{
					serviceName: cached.serviceName,
					domain: cached.domain,
					dataSelling: cached.dataSelling,
					aiTraining: cached.aiTraining,
					deleteDifficulty: cached.deleteDifficulty,
					summary: cached.summary,
					deletionInfo,
					source: "cache",
					analyzedAt: cached.analyzedAt,
				},
				{ status: 200 },
			);
		}

		let policyText: string | null = null;

		// Not in cache, check built-in cache first
		console.log(`[Route] Checking built-in cache for ${normalizedDomain}`);
		let analysis = await analyzePrivacyPolicy(serviceName, "", normalizedDomain);

		// If not in built-in cache, fetch from web and analyze with Gemini
		if (!analysis) {
			console.log(`[Route] Not in built-in cache, fetching policy from web...`);
			policyText = await fetchPrivacyPolicyText(normalizedDomain);

			if (!policyText) {
				console.warn(`[Route] No policy text found for ${normalizedDomain}, using defaults`);
				const defaultAnalysis = {
					dataSelling: 5,
					aiTraining: 5,
					deleteDifficulty: 5,
					summary: "Privacy policy not publicly available. Using default risk assessment.",
				};
				const deletionInfo = getDeletionInfoForService(
					normalizedDomain,
					null,
					defaultAnalysis,
				);

				// Return default neutral scores if can't fetch policy
				return NextResponse.json(
					{
						serviceName,
						domain: normalizedDomain,
						...defaultAnalysis,
						deletionInfo,
						source: "default",
						analyzedAt: new Date(),
					},
					{ status: 200 },
				);
			}

			// Analyze with Gemini
			console.log(`[Route] Analyzing policy with Gemini for ${serviceName}...`);
			analysis = await analyzePrivacyPolicy(serviceName, policyText, normalizedDomain);
		}

		const finalAnalysis = analysis || {
			dataSelling: 5,
			aiTraining: 5,
			deleteDifficulty: 5,
			summary: "Analysis unavailable. Using default risk assessment.",
		};

		const deletionInfo = getDeletionInfoForService(
			normalizedDomain,
			policyText,
			analysis || finalAnalysis,
		);

		// Determine source: built-in cache, Gemini LLM, or default
		let source: "built-in-cache" | "llm" | "default" = "default";
		const isInBuiltInCache = Object.keys({
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
		}).includes(normalizedDomain);

		if (isInBuiltInCache && analysis) {
			source = "built-in-cache";
		} else if (analysis) {
			source = "llm";
		}

		console.log(`[Route] Result: source=${source}, dataSelling=${finalAnalysis.dataSelling}, aiTraining=${finalAnalysis.aiTraining}`);

		// Cache the result (best effort)
		try {
			await savePolicyCache(
				serviceName,
				normalizedDomain,
				finalAnalysis.dataSelling,
				finalAnalysis.aiTraining,
				finalAnalysis.deleteDifficulty,
				finalAnalysis.summary,
				source,
			);
			console.log(`[Route] ✓ Saved to Firebase cache for ${normalizedDomain}`);
		} catch (cacheWriteError) {
			console.warn("[Route] Policy cache write failed:", cacheWriteError);
		}

		return NextResponse.json(
			{
				serviceName,
				domain: normalizedDomain,
				...finalAnalysis,
				deletionInfo,
				source,
				analyzedAt: new Date(),
			},
			{ status: 200 },
		);
	} catch (error) {
		console.error("[Route] Policy analysis error:", error);
		return NextResponse.json(
			{ error: "Failed to analyze policy" },
			{ status: 500 },
		);
	}
}
