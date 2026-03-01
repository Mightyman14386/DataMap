import { auth } from "../../../server/auth";
import { google } from "googleapis";
import { db } from "../../../Firebase/firebase";
import { doc, getDoc } from "firebase/firestore";
import { convertEmailsToServices } from "../../../server/privacy/client";
import { analyzeDiscoveredServices, AnalysisOutput } from "../../../server/analysis/discover-analyzer";
import { NextResponse } from "next/server";

/**
 * Filter emails for those related to account signups and services
 */
function isRelevantEmail(subject: string, from: string, snippet: string): boolean {
	const subjectLower = subject.toLowerCase();
	const snippetLower = snippet.toLowerCase();

	const relevantKeywords = [
		"welcome", "verify", "confirm", "account", "registration", "signup",
		"activate", "reset", "password", "subscription", "trial", "premium",
		"confirm email", "validate", "authorization", "action required"
	];

	return relevantKeywords.some(k =>
		subjectLower.includes(k) || snippetLower.includes(k)
	);
}

export async function GET() {
	try {
		const session = await auth();
			if (!session?.user?.id || !session?.user?.email) {
				return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
			}

			console.log("[Gmail Analyze] Looking up user:", session.user.email);

			// Look up user by email (matching how we save in auth.ts)
			const userDoc = await getDoc(doc(db, "users", session.user.email));
			const userData = userDoc.data();
		
			console.log("[Gmail Analyze] User data found:", !!userData);
			
			if (!userData?.accessToken) {
				console.error("[Gmail Analyze] No access token found for user");			return NextResponse.json({ error: "No Google account linked" }, { status: 401 });
		}
		const oauth2Client = new google.auth.OAuth2();
		oauth2Client.setCredentials({ access_token: userData?.accessToken });

		const gmail = google.gmail({ version: "v1", auth: oauth2Client });

		console.log("[Gmail Analyze] Starting email fetch...");

		// Fetch many emails to find services (increased from 50 to 250)
		const listResponse = await gmail.users.messages.list({
			userId: "me",
			maxResults: 250,
		});

		const messageIds = listResponse.data.messages ?? [];
		console.log(`[Gmail Analyze] Found ${messageIds.length} messages`);

		if (messageIds.length === 0) {
			return NextResponse.json({ count: 0, summary: { red: 0, yellow: 0, green: 0 }, results: [] });
		}

		// Fetch full message details in parallel
		console.log("[Gmail Analyze] Fetching full message details...");
		const fullMessages = await Promise.all(
			messageIds.map((msg) =>
				gmail.users.messages.get({ userId: "me", id: msg.id! })
			)
		);

		// Parse emails and filter for relevant ones
		const parsedEmails = fullMessages
			.map((res) => {
				const headers = res.data.payload?.headers ?? [];
				const dateValue = headers.find(h => h.name === "Date")?.value;
				return {
					subject: headers.find(h => h.name === "Subject")?.value ?? "",
					from: headers.find(h => h.name === "From")?.value ?? "",
					...(dateValue && { date: dateValue }),
				};
			})
			.filter(email => isRelevantEmail(email.subject, email.from, ""));

		console.log(`[Gmail Analyze] Found ${parsedEmails.length} relevant emails`);

		// Convert to services for analysis
		const discoveredServices = convertEmailsToServices(parsedEmails);
		console.log(`[Gmail Analyze] Extracted ${discoveredServices.length} services from emails`);

		if (discoveredServices.length === 0) {
			console.log("[Gmail Analyze] No services discovered");
			return NextResponse.json({ count: 0, summary: { red: 0, yellow: 0, green: 0 }, results: [] });
		}

		// Run analysis pipeline with timeout to prevent hanging
		// Call directly without HTTP overhead, preserving session context
		console.log(`[Gmail Analyze] Starting analysis pipeline for ${discoveredServices.length} services...`);
		console.log(`[Gmail Analyze] Using userId: ${session.user.email}`);
		console.log(`[Gmail Analyze] Analysis will timeout after 45 seconds`);
		
		let analysis: AnalysisOutput;
		try {
			const analysisPromise = analyzeDiscoveredServices(discoveredServices, {
				persist: true,
				userId: session.user.email // Use email as userId to match Firestore key
			});
			
			// 45-second timeout for analysis (includes LLM retries)
			const timeoutPromise = new Promise<AnalysisOutput>((_, reject) =>
				setTimeout(() => reject(new Error("Analysis timeout - returning cached data only")), 45000)
			);
			
			analysis = await Promise.race([analysisPromise, timeoutPromise]);
		} catch (timeoutError) {
			console.warn("[Gmail Analyze] Analysis timed out:", timeoutError);
			// Return partial results after timeout
			analysis = {
				count: discoveredServices.length,
				summary: { red: 0, yellow: discoveredServices.length, green: 0 },
				results: discoveredServices.map(service => ({
					service: {
						serviceName: service.serviceName,
						domain: service.domain,
					},
					error: "Analysis timeout - using cached data"
				}))
			};
		}
		
		console.log(`[Gmail Analyze] Analysis complete: ${analysis.count} services analyzed`);

		return NextResponse.json({
			count: analysis.count,
			summary: analysis.summary,
			results: analysis.results
		});
	} catch (error) {
		console.error("[Gmail Analyze] Error:", error);
		return NextResponse.json(
			{ error: "Failed to analyze emails", details: String(error) },
			{ status: 500 }
		);
	}
}