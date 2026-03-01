import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "~/env";
import { getPolicyCached, savePolicyCache } from "~/server/firebase-db";

const analyzeRequestSchema = z.object({
	serviceName: z.string().min(1),
	domain: z.string().min(1),
});

/**
 * Fetch privacy policy text from a domain using Jina reader (free)
 */
async function fetchPrivacyPolicyText(domain: string): Promise<string | null> {
	try {
		// Common privacy policy URL patterns
		const urls = [
			`https://${domain}/privacy`,
			`https://${domain}/privacy-policy`,
			`https://${domain}/policies/privacy`,
			`https://${domain}/legal/privacy`,
		];

		for (const url of urls) {
			try {
				// Use Jina reader to get clean markdown text from privacy policy
				const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;
				const resp = await fetch(jinaUrl, {
					method: "GET",
					headers: {
						"Accept": "text/markdown",
					},
				});

				if (resp.ok) {
					const text = await resp.text();
					// Only return if we got meaningful content (>500 chars)
					if (text && text.length > 500) {
						return text.slice(0, 10000); // Limit to first 10k chars
					}
				}
			} catch {
				// Continue to next URL
				continue;
			}
		}

		return null;
	} catch (error) {
		console.error("Error fetching privacy policy:", error);
		return null;
	}
}

/**
 * Analyze privacy policy using OpenAI or Claude
 */
async function analyzeWithLLM(
	serviceName: string,
	policyText: string,
): Promise<{
	dataSelling: number;
	aiTraining: number;
	deleteDifficulty: number;
	summary: string;
} | null> {
	try {
		const openaiKey = env.OPENAI_API_KEY;
		if (!openaiKey) {
			console.warn("No LLM API key configured, using default scores");
			return null;
		}

		const prompt = `Analyze the following privacy policy for ${serviceName}. Rate on a scale of 1-10 where 1 is least concerning and 10 is most concerning:

1. **Data Selling**: Does the company sell user data to third parties?
2. **AI Training**: Does the company use user data to train AI/ML models?
3. **Deletion Difficulty**: How hard is it to delete your account and data?

Respond with ONLY valid JSON (no markdown, no code blocks):
{
  "dataSelling": <number>,
  "aiTraining": <number>,
  "deleteDifficulty": <number>,
  "summary": "<2-sentence summary>"
}

Policy text:
${policyText}`;

		const response = await fetch("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${openaiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: "gpt-3.5-turbo",
				messages: [{ role: "user", content: prompt }],
				temperature: 0.3,
				max_tokens: 300,
			}),
		});

		if (!response.ok) {
			console.error("OpenAI API error:", response.status);
			return null;
		}

		const data = await response.json();
		const content = data.choices?.[0]?.message?.content;

		if (!content) return null;

		// Parse JSON from response
		const jsonMatch = content.match(/\{[\s\S]*\}/);
		if (!jsonMatch) return null;

		const parsed = JSON.parse(jsonMatch[0]);
		return {
			dataSelling: Math.max(1, Math.min(10, parseInt(parsed.dataSelling) || 5)),
			aiTraining: Math.max(1, Math.min(10, parseInt(parsed.aiTraining) || 5)),
			deleteDifficulty: Math.max(
				1,
				Math.min(10, parseInt(parsed.deleteDifficulty) || 5),
			),
			summary:
				parsed.summary ||
				`Default analysis for ${serviceName} privacy policy.`,
		};
	} catch (error) {
		console.error("LLM analysis error:", error);
		return null;
	}
}

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
			return NextResponse.json(
				{
					serviceName: cached.serviceName,
					domain: cached.domain,
					dataSelling: cached.dataSelling,
					aiTraining: cached.aiTraining,
					deleteDifficulty: cached.deleteDifficulty,
					summary: cached.summary,
					source: "cache",
					analyzedAt: cached.analyzedAt,
				},
				{ status: 200 },
			);
		}

		// Not in cache, fetch and analyze
		const policyText = await fetchPrivacyPolicyText(normalizedDomain);

		if (!policyText) {
			// Return default neutral scores if can't fetch policy
			return NextResponse.json(
				{
					serviceName,
					domain: normalizedDomain,
					dataSelling: 5,
					aiTraining: 5,
					deleteDifficulty: 5,
					summary: "Privacy policy not publicly available. Using default risk assessment.",
					source: "default",
					analyzedAt: new Date(),
				},
				{ status: 200 },
			);
		}

		// Analyze with LLM
		const analysis = await analyzeWithLLM(serviceName, policyText);

		const finalAnalysis = analysis || {
			dataSelling: 5,
			aiTraining: 5,
			deleteDifficulty: 5,
			summary: "Analysis unavailable. Using default risk assessment.",
		};

		// Cache the result (best effort)
		try {
			await savePolicyCache(
				serviceName,
				normalizedDomain,
				finalAnalysis.dataSelling,
				finalAnalysis.aiTraining,
				finalAnalysis.deleteDifficulty,
				finalAnalysis.summary,
				analysis ? "llm" : "default",
			);
		} catch (cacheWriteError) {
			console.warn("Policy cache write failed, returning uncached analysis:", cacheWriteError);
		}

		return NextResponse.json(
			{
				serviceName,
				domain: normalizedDomain,
				...finalAnalysis,
				source: analysis ? "llm" : "default",
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
