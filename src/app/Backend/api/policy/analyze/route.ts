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
		return NextResponse.json(
			{ error: "Invalid request body" },
			{ status: 400 },
		);
	}

	const { serviceName, domain } = parsed.data;
	const normalizedDomain = domain.trim().toLowerCase();

	try {
		// Check cache first (best effort)
		let cached: Awaited<ReturnType<typeof getPolicyCached>> = null;
		try {
			cached = await getPolicyCached(normalizedDomain);
		} catch (cacheReadError) {
			console.warn("Policy cache read failed, continuing without cache:", cacheReadError);
		}

		if (cached && cached.dataSelling && cached.aiTraining) {
			const deletionInfo = getDeletionInfoForService(normalizedDomain, null, {
				dataSelling: cached.dataSelling,
				aiTraining: cached.aiTraining,
				deleteDifficulty: cached.deleteDifficulty,
				summary: cached.summary,
			});

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
		let analysis = await analyzePrivacyPolicy(serviceName, "", normalizedDomain);

		// If not in built-in cache, fetch from web and analyze with Gemini
		if (!analysis) {
			policyText = await fetchPrivacyPolicyText(normalizedDomain);

			if (!policyText) {
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
		} catch (cacheWriteError) {
			console.warn("Policy cache write failed, returning uncached analysis:", cacheWriteError);
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
		console.error("Policy analysis error:", error);
		return NextResponse.json(
			{ error: "Failed to analyze policy" },
			{ status: 500 },
		);
	}
}
