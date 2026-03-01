import { auth } from "../../../server/auth";
import { google, gmail_v1 } from "googleapis";
import { db } from "../../../Firebase/firebase";
import { doc, getDoc } from "firebase/firestore";
import { convertEmailsToServices } from "../../../server/privacy/client";
import { analyzeDiscoveredServices } from "../../../server/analysis/discover-analyzer";
import { NextResponse } from "next/server";

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

		const userDoc = await getDoc(doc(db, "users", session.user.email));
		const userData = userDoc.data();

		if (!userData?.accessToken) {
			return NextResponse.json({ error: "No Google account linked" }, { status: 401 });
		}

		// Fire-and-forget — returns immediately, analysis runs in background
		void runAnalyzeBackground(userData.accessToken, session.user.email);

		return NextResponse.json({ status: "started" });
	} catch (error) {
		console.error("[Gmail Analyze] Error:", error);
		return NextResponse.json({ error: "Failed to start analysis" }, { status: 500 });
	}
}

async function runAnalyzeBackground(accessToken: string, userId: string) {
	try {
		const oauth2Client = new google.auth.OAuth2();
		oauth2Client.setCredentials({ access_token: accessToken });
		const gmail = google.gmail({ version: "v1", auth: oauth2Client });

		console.log("[Gmail Analyze] Starting paginated email fetch...");

		// Paginate through ALL matching emails (no cap)
		const allMessageIds: string[] = [];
		let pageToken: string | undefined = undefined;
		const listParams: gmail_v1.Params$Resource$Users$Messages$List = {
			userId: "me",
			maxResults: 50,
			q: "subject:(confirm OR welcome OR verify OR account OR signup)",
		};
		do {
			if (pageToken) listParams.pageToken = pageToken;
			const res = await gmail.users.messages.list(listParams);

			for (const msg of res.data.messages ?? []) {
				if (msg.id) allMessageIds.push(msg.id);
			}

			pageToken = res.data.nextPageToken ?? undefined;
			if (pageToken) await new Promise(r => setTimeout(r, 500));
		} while (pageToken);

		console.log(`[Gmail Analyze] Found ${allMessageIds.length} matching messages`);
		if (allMessageIds.length === 0) return;

		// Fetch full message details in chunks of 20 to stay within Gmail rate limits
		const parsedEmails: { subject: string; from: string; date?: string }[] = [];
		const chunkSize = 20;

		for (let i = 0; i < allMessageIds.length; i += chunkSize) {
			const chunk = allMessageIds.slice(i, i + chunkSize);
			const fullMessages = await Promise.all(
				chunk.map(id => gmail.users.messages.get({ userId: "me", id }))
			);

			for (const res of fullMessages) {
				const headers = res.data.payload?.headers ?? [];
				const subject = headers.find(h => h.name === "Subject")?.value ?? "";
				const from = headers.find(h => h.name === "From")?.value ?? "";
				const snippet = res.data.snippet ?? "";
				const dateValue = headers.find(h => h.name === "Date")?.value;

				if (isRelevantEmail(subject, from, snippet)) {
					parsedEmails.push({
						subject,
						from,
						...(dateValue && { date: dateValue }),
					});
				}
			}

			if (i + chunkSize < allMessageIds.length) {
				await new Promise(r => setTimeout(r, 1000));
			}
		}

		console.log(`[Gmail Analyze] ${parsedEmails.length} relevant emails found`);

		const discoveredServices = convertEmailsToServices(parsedEmails);
		console.log(`[Gmail Analyze] ${discoveredServices.length} unique services extracted`);

		if (discoveredServices.length === 0) return;

		// Process in batches of 10 — each batch writes to Firestore immediately
		// so the dashboard updates live as each batch completes
		await analyzeDiscoveredServices(discoveredServices, {
			persist: true,
			userId,
			batchSize: 10,
		});

		console.log("[Gmail Analyze] Background analysis complete");
	} catch (err) {
		console.error("[Gmail Analyze] Background error:", err);
	}
}
