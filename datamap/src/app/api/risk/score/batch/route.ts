import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { discoveredServices, riskResults } from "~/server/db/schema";
import { scoreServiceRisk } from "~/server/risk/engine";

const batchScoreRequestSchema = z.object({
	services: z.array(
		z.object({
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
		}),
	),
	persist: z.boolean().optional().default(true),
});

export async function POST(request: Request) {
	const session = await auth();
	const userId = session?.user?.id;

	const parsed = batchScoreRequestSchema.safeParse(await request.json());
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

	for (const serviceInput of body.services) {
		const normalizedDomain = serviceInput.domain.trim().toLowerCase();
		const lastUsedAt = serviceInput.usage.lastUsedAt
			? new Date(serviceInput.usage.lastUsedAt)
			: undefined;

		const risk = scoreServiceRisk({
			serviceName: serviceInput.serviceName.trim(),
			domain: normalizedDomain,
			policy: serviceInput.policy,
			breach: serviceInput.breach,
			usage: { lastUsedAt },
		});

		tierCounts[risk.tier]++;

		if (!body.persist || !userId) {
			results.push({ risk });
			continue;
		}

		// Persist to database
		try {
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
				results.push({ risk, error: "Failed to upsert service" });
				continue;
			}

			const [savedRisk] = await db
				.insert(riskResults)
				.values({
					serviceId: service.id,
					policyDataSelling: serviceInput.policy.dataSelling,
					policyAiTraining: serviceInput.policy.aiTraining,
					policyDeleteDifficulty: serviceInput.policy.deleteDifficulty,
					policySummary: serviceInput.policy.summary,
					breachDetected: serviceInput.breach.wasBreached,
					breachName: serviceInput.breach.breachName,
					breachYear: serviceInput.breach.breachYear,
					score: risk.score,
					tier: risk.tier,
					reasons: risk.reasons,
				})
				.returning({ id: riskResults.id, scoredAt: riskResults.scoredAt });

			results.push({
				risk: {
					...risk,
					id: savedRisk?.id,
					scoredAt: savedRisk?.scoredAt,
				},
				service: {
					id: service.id,
				},
			});
		} catch (error) {
			results.push({
				risk,
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	}

	// Sort by delete priority descending
	results.sort(
		(a, b) => (b.risk.deletePriority ?? 0) - (a.risk.deletePriority ?? 0),
	);

	return NextResponse.json(
		{
			count: results.length,
			summary: tierCounts,
			results,
		},
		{ status: 200 },
	);
}

export async function GET(request: Request) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	// Fetch all services with their latest risk results
	const servicesWithRisk = await db
		.select({
			serviceId: discoveredServices.id,
			serviceName: discoveredServices.serviceName,
			domain: discoveredServices.domain,
			lastUsedAt: discoveredServices.lastUsedAt,
			firstSeenAt: discoveredServices.firstSeenAt,
			riskId: riskResults.id,
			score: riskResults.score,
			tier: riskResults.tier,
			reasons: riskResults.reasons,
			scoredAt: riskResults.scoredAt,
			breachDetected: riskResults.breachDetected,
			breachName: riskResults.breachName,
		})
		.from(discoveredServices)
		.leftJoin(riskResults, eq(riskResults.serviceId, discoveredServices.id))
		.where(eq(discoveredServices.userId, session.user.id))
		.orderBy(desc(riskResults.score));

	// Group by service (take latest risk result per service)
	const serviceMap = new Map();
	for (const row of servicesWithRisk) {
		if (!serviceMap.has(row.serviceId)) {
			serviceMap.set(row.serviceId, {
				id: row.serviceId,
				serviceName: row.serviceName,
				domain: row.domain,
				lastUsedAt: row.lastUsedAt,
				firstSeenAt: row.firstSeenAt,
				risk: row.riskId
					? {
							id: row.riskId,
							score: row.score,
							tier: row.tier,
							reasons: row.reasons,
							scoredAt: row.scoredAt,
							breachDetected: row.breachDetected,
							breachName: row.breachName,
						}
					: null,
			});
		}
	}

	const services = Array.from(serviceMap.values());
	const tierCounts = { red: 0, yellow: 0, green: 0 };

	for (const service of services) {
		if (service.risk?.tier) {
			tierCounts[service.risk.tier as keyof typeof tierCounts]++;
		}
	}

	return NextResponse.json(
		{
			count: services.length,
			summary: tierCounts,
			services,
		},
		{ status: 200 },
	);
}
