import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { discoveredServices, riskResults } from "~/server/db/schema";
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
	const userId = session?.user?.id;
	const body = parsed.data;
	if (body.persist && !userId) {
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

	if (!body.persist) {
		return NextResponse.json({ risk }, { status: 200 });
	}

	if (!userId) {
		return NextResponse.json(
			{ error: "Unauthorized for persist=true" },
			{ status: 401 },
		);
	}

	const [service] = await db
		.insert(discoveredServices)
		.values({
			userId,
			serviceName: risk.serviceName,
			domain: risk.domain,
			lastSeenAt: new Date(),
			lastUsedAt,
		})
		.onConflictDoUpdate({
			target: [discoveredServices.userId, discoveredServices.domain],
			set: {
				serviceName: risk.serviceName,
				lastSeenAt: new Date(),
				lastUsedAt,
			},
		})
		.returning({ id: discoveredServices.id });

	if (!service) {
		return NextResponse.json(
			{ error: "Failed to upsert discovered service" },
			{ status: 500 },
		);
	}

	const [savedRisk] = await db
		.insert(riskResults)
		.values({
			serviceId: service.id,
			policyDataSelling: body.policy.dataSelling,
			policyAiTraining: body.policy.aiTraining,
			policyDeleteDifficulty: body.policy.deleteDifficulty,
			policySummary: body.policy.summary,
			breachDetected: body.breach.wasBreached,
			breachName: body.breach.breachName,
			breachYear: body.breach.breachYear,
			score: risk.score,
			tier: risk.tier,
			reasons: risk.reasons,
		})
		.returning({ id: riskResults.id, scoredAt: riskResults.scoredAt });

	if (!savedRisk) {
		return NextResponse.json(
			{ error: "Failed to save risk result" },
			{ status: 500 },
		);
	}

	const [latestRisk] = await db
		.select({
			id: riskResults.id,
			score: riskResults.score,
			tier: riskResults.tier,
			reasons: riskResults.reasons,
			scoredAt: riskResults.scoredAt,
		})
		.from(riskResults)
		.where(eq(riskResults.id, savedRisk.id));

	const [latestForService] = await db
		.select({ id: riskResults.id })
		.from(riskResults)
		.where(eq(riskResults.serviceId, service.id))
		.orderBy(desc(riskResults.scoredAt))
		.limit(1);

	const deletePriority = risk.deletePriority;

	return NextResponse.json(
		{
			risk: {
				...risk,
				id: latestRisk?.id,
				scoredAt: latestRisk?.scoredAt,
				deletePriority,
			},
			service: {
				id: service.id,
				isLatest: latestForService?.id === latestRisk?.id,
			},
		},
		{ status: 200 },
	);
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

	const [service] = await db
		.select({ id: discoveredServices.id, domain: discoveredServices.domain })
		.from(discoveredServices)
		.where(
			and(
				eq(discoveredServices.userId, session.user.id),
				eq(discoveredServices.domain, domain),
			),
		)
		.limit(1);

	if (!service) {
		return NextResponse.json({ risk: null }, { status: 200 });
	}

	const [risk] = await db
		.select({
			id: riskResults.id,
			score: riskResults.score,
			tier: riskResults.tier,
			reasons: riskResults.reasons,
			scoredAt: riskResults.scoredAt,
			policyDataSelling: riskResults.policyDataSelling,
			policyAiTraining: riskResults.policyAiTraining,
			policyDeleteDifficulty: riskResults.policyDeleteDifficulty,
			breachDetected: riskResults.breachDetected,
			breachName: riskResults.breachName,
			breachYear: riskResults.breachYear,
			policySummary: riskResults.policySummary,
		})
		.from(riskResults)
		.where(eq(riskResults.serviceId, service.id))
		.orderBy(desc(riskResults.scoredAt))
		.limit(1);

	return NextResponse.json({ risk: risk ?? null }, { status: 200 });
}
