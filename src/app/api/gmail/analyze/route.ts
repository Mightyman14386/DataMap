import { auth } from "../../../Backend/server/auth";
import { google } from "googleapis";
import { db } from "../../../Backend/Firebase/firebase";
import { doc, getDoc } from "firebase/firestore";
import { convertEmailsToServices, analyzeServices } from "../../../Backend/server/privacy/client";

export async function GET() {
    const session = await auth();
    if (!session?.user?.id || !session?.user?.email) {
        return Response.json({ error: "Not authenticated" }, { status: 401 });
    }
    
    console.log("[Gmail Analyze] Looking up user:", session.user.email);
    
    // Look up user by email (matching how we save in auth.ts)
    const userDoc = await getDoc(doc(db, "users", session.user.email));
    const userData = userDoc.data();
    
    console.log("[Gmail Analyze] User data found:", !!userData);
    
    if (!userData?.accessToken) {
        console.error("[Gmail Analyze] No access token found for user");
        return Response.json({ error: "No Google account linked" }, { status: 401 });
    }
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: userData?.accessToken });
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    // Fetch recent emails
    const messages = await gmail.users.messages.list({ userId: "me", maxResults: 50 });
    const fullMessages = await Promise.all(
        (messages.data.messages ?? []).map((msg) =>
            gmail.users.messages.get({ userId: "me", id: msg.id! })
        )
    );
    // Parse emails for welcome/verify/confirmation
    const parsedEmails = fullMessages.map((res) => {
        const headers = res.data.payload?.headers ?? [];
        return {
            subject: headers.find(h => h.name === "Subject")?.value ?? "",
            from: headers.find(h => h.name === "From")?.value ?? "",
            date: headers.find(h => h.name === "Date")?.value ?? undefined,
        };
    });
    // Use pipeline utility to extract services
    const discoveredServices = convertEmailsToServices(parsedEmails);
    // Run analysis pipeline
    const analysis = await analyzeServices(discoveredServices, { persist: true });
    return Response.json({ count: analysis.count, summary: analysis.summary, results: analysis.results });
}
