import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "~/app/Backend/server/auth";
import {
	upsertDiscoveredService,
	saveRiskResult,
	getUserServicesWithRisks,
} from "~/app/Backend/Firebase/firebase-db";
import { scoreServiceRisk } from "~/app/Backend/server/risk/engine";

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
			policy: {
				dataSelling: serviceInput.policy.dataSelling,
				aiTraining: serviceInput.policy.aiTraining,
				deleteDifficulty: serviceInput.policy.deleteDifficulty,
				...(serviceInput.policy.summary !== undefined
					? { summary: serviceInput.policy.summary }
					: {}),
			},
			breach: {
				wasBreached: serviceInput.breach.wasBreached,
				...(serviceInput.breach.breachName !== undefined
					? { breachName: serviceInput.breach.breachName }
					: {}),
				...(serviceInput.breach.breachYear !== undefined
					? { breachYear: serviceInput.breach.breachYear }
					: {}),
			},
			usage: lastUsedAt ? { lastUsedAt } : {},
		});

		tierCounts[risk.tier]++;

		if (!body.persist || !userId) {
			results.push({ risk });
			continue;
		}

		// Persist to Firebase
		try {
			const serviceId = await upsertDiscoveredService(
				userId,
				risk.serviceName,
				risk.domain,
				lastUsedAt,
			);

			const riskId = await saveRiskResult(
				serviceId,
				serviceInput.policy.dataSelling,
				serviceInput.policy.aiTraining,
				serviceInput.policy.deleteDifficulty,
				serviceInput.policy.summary,
				serviceInput.breach.wasBreached,
				serviceInput.breach.breachName,
				serviceInput.breach.breachYear,
				risk.score,
				risk.tier,
				risk.reasons,
			);

			results.push({
				risk: {
					...risk,
					id: riskId,
					scoredAt: new Date(),
				},
				service: {
					id: serviceId,
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

	try {
		const services = await getUserServicesWithRisks(session.user.id);

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
	} catch (error) {
		console.error("Error fetching user services:", error);
		return NextResponse.json(
			{ error: "Failed to fetch services" },
			{ status: 500 },
		);
	}
}
