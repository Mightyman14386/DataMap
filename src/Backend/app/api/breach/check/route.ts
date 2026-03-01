import { NextResponse } from "next/server";
import { z } from "zod";

const hibpApiKey = process.env.HIBP_API_KEY;
const HIBP_API_URL = "https://haveibeenpwned.com/api/v3/breaches";

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

	if (!hibpApiKey) {
		return NextResponse.json(
			{ error: "HIBP API key not configured" },
			{ status: 500 },
		);
	}

	try {
		const queryDomain = parsed.data.domain;
	const url = `${HIBP_API_URL}?domain=${encodeURIComponent(queryDomain)}`;
		const resp = await fetch(url, {
			headers: {
				"hibp-api-key": hibpApiKey,
				"user-agent": "DataMapHackathon/1.0",
			},
		});

		if (!resp.ok) {
			return NextResponse.json(
				{ error: `HIBP API error: ${resp.status}` },
				{ status: resp.status },
			);
		}

		const breaches = await resp.json();
		if (!Array.isArray(breaches) || breaches.length === 0) {
			return NextResponse.json({ wasBreached: false, breaches: [] }, { status: 200 });
		}

		const latestYear = Math.max(...breaches.map((b: any) => parseInt(b.AddedDate?.slice(0, 4) || "0", 10)));

		return NextResponse.json({
			wasBreached: true,
			breaches,
			latestYear,
		}, { status: 200 });
	} catch (error) {
		return NextResponse.json(
			{ error: "Failed to query HIBP", details: error instanceof Error ? error.message : String(error) },
			{ status: 500 },
		);
	}
}
