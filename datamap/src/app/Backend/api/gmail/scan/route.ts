import { auth } from "~/server/auth";
  import { google } from "googleapis";
import { adminDb } from "~/lib/firebase-admin";

  export async function GET() {
      const session = await auth();

      if (!session?.user?.id) {
          return Response.json({ error: "Not authenticated" }, { status: 401 });
      }

      const snapshot = await adminDb
      .collection("accounts")
      .where("userId", "==", session.user.id)
      .where("provider", "==", "google")
      .limit(1)
      .get();

  const account = snapshot.docs[0]?.data();

      if (!account?.access_token) {
          return Response.json({ error: "No Google account found" }, { status: 401 });
      }

      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: account.access_token });

      const gmail = google.gmail({ version: "v1", auth: oauth2Client });

      const messages = await gmail.users.messages.list({
          userId: "me",
          maxResults: 10,
      });

      return Response.json(messages.data);
  }