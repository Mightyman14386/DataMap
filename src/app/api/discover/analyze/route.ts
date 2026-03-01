import { NextResponse } from "next/server";
import { fetch as nodeFetch } from "undici";

export async function POST(request: Request) {
	try {
		const body = await request.json();

		// Forward to Backend API 
		const backendUrl = `http://localhost:3001/Backend/api/discover/analyze`;
		
		const response = await fetch(backendUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		});

		const data = await response.json();
		
		if (!response.ok) {
			return NextResponse.json(data, { status: response.status });
		}

		return NextResponse.json(data);
	} catch (error) {
		console.error("Error in /api/discover/analyze:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Analysis failed",
			},
			{ status: 500 }
		);
	}
}
