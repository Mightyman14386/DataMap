import { auth } from "../../../server/auth";
import { google, gmail_v1 } from "googleapis";
import { db } from "../../../Firebase/firebase";
import { doc, getDoc } from "firebase/firestore";
import { convertEmailsToServices } from "../../../server/privacy/client";
import { analyzeDiscoveredServices } from "../../../server/analysis/discover-analyzer";
import { NextResponse } from "next/server";

const LIST_PAGE_SIZE = 100;
const FETCH_CONCURRENCY = 15;
const MAX_RETRIES = 5;

function isRelevantEmail(subject: string, snippet: string): boolean {
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

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry<T>(operation: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
	let attempt = 0;

	while (true) {
		try {
			return await operation();
		} catch (error: unknown) {
			const gaxiosError = error as { code?: number; response?: { status?: number } };
			const status = gaxiosError.response?.status ?? gaxiosError.code;
			const retryable = status === 429 || (typeof status === "number" && status >= 500);

			if (!retryable || attempt >= retries) {
				throw error;
			}

			const backoffMs = Math.min(8000, 300 * 2 ** attempt) + Math.floor(Math.random() * 200);
			await sleep(backoffMs);
			attempt += 1;
		}
	}
}

function extractRelevantHeaders(headers: gmail_v1.Schema$MessagePartHeader[] = []): {
	subject: string;
	from: string;
	date?: string;
} {
	let subject = "";
	let from = "";
	let date: string | undefined;

	for (const header of headers) {
		if (!header.name || !header.value) continue;
		const normalizedName = header.name.toLowerCase();

		if (normalizedName === "subject") subject = header.value;
		if (normalizedName === "from") from = header.value;
		if (normalizedName === "date") date = header.value;
	}

	return { subject, from, ...(date && { date }) };
}

async function mapWithConcurrency<T, R>(
	items: T[],
	concurrency: number,
	mapper: (item: T) => Promise<R>,
): Promise<R[]> {
	const results: R[] = [];
	let index = 0;

	const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
		while (index < items.length) {
			const currentIndex = index;
			index += 1;
			results[currentIndex] = await mapper(items[currentIndex]!);
		}
	});

	await Promise.all(workers);
	return results;
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

		const parsedEmails: { subject: string; from: string; date?: string }[] = [];
		let pageToken: string | undefined = undefined;
		const listParams: gmail_v1.Params$Resource$Users$Messages$List = {
			userId: "me",
			maxResults: LIST_PAGE_SIZE,
			q: "subject:(confirm OR welcome OR verify OR account OR signup)",
			fields: "messages/id,nextPageToken,resultSizeEstimate",
		};

		let totalMatchedMessages = 0;
		let totalProcessedMessages = 0;

		do {
			if (pageToken) listParams.pageToken = pageToken;
			const res = await withRetry(() => gmail.users.messages.list(listParams));

			const messageIds = (res.data.messages ?? [])
				.map(message => message.id)
				.filter((id): id is string => Boolean(id));
			totalMatchedMessages += messageIds.length;

			const fullMessages = await mapWithConcurrency(messageIds, FETCH_CONCURRENCY, id =>
				withRetry(() =>
					gmail.users.messages.get({
						userId: "me",
						id,
						format: "metadata",
						metadataHeaders: ["Subject", "From", "Date"],
						fields: "id,snippet,payload/headers",
					}),
				),
			);

			for (const messageResponse of fullMessages) {
				totalProcessedMessages += 1;
				const headerValues = extractRelevantHeaders(messageResponse.data.payload?.headers ?? []);
				const subject = headerValues.subject;
				const from = headerValues.from;
				const snippet = messageResponse.data.snippet ?? "";
				const dateValue = headerValues.date;

				if (isRelevantEmail(subject, snippet)) {
					parsedEmails.push({
						subject,
						from,
						...(dateValue && { date: dateValue }),
					});
				}
			}

			pageToken = res.data.nextPageToken ?? undefined;

			console.log(
				`[Gmail Analyze] Page processed. totalMatched=${totalMatchedMessages}, totalProcessed=${totalProcessedMessages}, relevant=${parsedEmails.length}`,
			);
		} while (pageToken);

		console.log(`[Gmail Analyze] Found ${totalMatchedMessages} matching messages`);
		if (totalMatchedMessages === 0) return;

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
