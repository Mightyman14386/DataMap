import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "~/app/Backend/server/auth";
import { analyzeDiscoveredServices } from "~/app/Backend/server/analysis/discover-analyzer";

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
	const userId = session?.user?.email; // Use email as userId to match Firestore key

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

	const result = await analyzeDiscoveredServices(body.services, {
		persist: body.persist,
		userId: userId,
	});

	return NextResponse.json(result, { status: 200 });
}
