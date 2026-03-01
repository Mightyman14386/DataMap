import { NextResponse } from "next/server";
import { z } from "zod";

import { checkDataBreach } from "~/app/Backend/server/privacy/analysis-service";

const querySchema = z.object({ domain: z.string().min(1) });

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const domainParam = searchParams.get("domain");

	const parsed = querySchema.safeParse({ domain: domainParam });
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "Missing or invalid domain" },
			{ status: 400 },
		);
	}

	try {
		const queryDomain = parsed.data.domain.trim().toLowerCase();
		const breachInfo = await checkDataBreach(queryDomain);

		return NextResponse.json(breachInfo, { status: 200 });
	} catch (error) {
		return NextResponse.json(
			{ error: "Failed to query HIBP", details: error instanceof Error ? error.message : String(error) },
			{ status: 500 },
		);
	}
}
