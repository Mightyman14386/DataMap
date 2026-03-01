import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "~/server/auth";
import {
	getPolicyCached,
	getLatestRiskForDomain,
	upsertDiscoveredService,
	saveRiskResult,
} from "~/server/firebase-db";
import { scoreServiceRisk } from "~/server/risk/engine";

const scoreRequestSchema = z.object({
	serviceName: z.string().min(1),
	domain: z.string().min(1),
	policy: z.object({
		dataSelling: z.number().min(1).max(10),
		aiTraining: z.number().min(1).max(10),
		deleteDifficulty: z.number().min(1).max(10),
		summary: z.string().optional(),
	}),
	breach: z.object({
		wasBreached: z.boolean(),
		breachName: z.string().optional(),
		breachYear: z.number().int().optional(),
	}),
	usage: z.object({
		lastUsedAt: z.string().datetime().optional(),
	}),
	persist: z.boolean().optional().default(true),
});

export async function POST(request: Request) {
	const parsed = scoreRequestSchema.safeParse(await request.json());
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "Invalid request body", issues: parsed.error.flatten() },
			{ status: 400 },
		);
	}

	const session = await auth();
	const body = parsed.data;

	if (body.persist && !session?.user?.id) {
		return NextResponse.json(
			{ error: "Unauthorized for persist=true" },
			{ status: 401 },
		);
	}

	const normalizedDomain = body.domain.trim().toLowerCase();
	const lastUsedAt = body.usage.lastUsedAt
		? new Date(body.usage.lastUsedAt)
		: undefined;

	const risk = scoreServiceRisk({
		serviceName: body.serviceName.trim(),
		domain: normalizedDomain,
		policy: body.policy,
		breach: body.breach,
		usage: { lastUsedAt },
	});

	if (!body.persist || !session?.user?.id) {
		return NextResponse.json({ risk }, { status: 200 });
	}

	try {
		const userId = session.user.id;

		// Upsert discovered service
		const serviceId = await upsertDiscoveredService(
			userId,
			risk.serviceName,
			risk.domain,
			lastUsedAt,
		);

		// Save risk result
		const riskId = await saveRiskResult(
			serviceId,
			body.policy.dataSelling,
			body.policy.aiTraining,
			body.policy.deleteDifficulty,
			body.policy.summary,
			body.breach.wasBreached,
			body.breach.breachName,
			body.breach.breachYear,
			risk.score,
			risk.tier,
			risk.reasons,
		);

		return NextResponse.json(
			{
				risk: {
					...risk,
					id: riskId,
					scoredAt: new Date(),
					deletePriority: risk.deletePriority,
				},
				service: {
					id: serviceId,
				},
			},
			{ status: 200 },
		);
	} catch (error) {
		console.error("Risk scoring error:", error);
		return NextResponse.json(
			{ error: "Failed to score risk" },
			{ status: 500 },
		);
	}
}

export async function GET(request: Request) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { searchParams } = new URL(request.url);
	const domain = searchParams.get("domain")?.trim().toLowerCase();
	if (!domain) {
		return NextResponse.json(
			{ error: "Missing required query param: domain" },
			{ status: 400 },
		);
	}

	try {
		const risk = await getLatestRiskForDomain(session.user.id, domain);
		return NextResponse.json({ risk: risk ?? null }, { status: 200 });
	} catch (error) {
		console.error("Error fetching risk:", error);
		return NextResponse.json(
			{ error: "Failed to fetch risk" },
			{ status: 500 },
		);
	}
}
