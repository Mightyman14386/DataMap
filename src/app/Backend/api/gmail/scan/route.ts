import { auth } from "../../../server/auth";
import { google, gmail_v1  } from "googleapis";
import { db} from "../../../Firebase/firebase";
import { collection, query, where, getDocs, limit, doc, getDoc, setDoc } from "firebase/firestore";
import path from "path";
import fs from "fs";

const EMAILS_FILE = "emails.json";

async function runScanBackground(accessToken: string) {
     try {
         const oauth2Client = new google.auth.OAuth2();
         oauth2Client.setCredentials({ access_token: accessToken });
         const gmail = google.gmail({ version: "v1", auth: oauth2Client });

         const saved: object[] = [];
         fs.writeFileSync(EMAILS_FILE, JSON.stringify([], null, 2));

         let pageToken: string | undefined = undefined;
         const listParams: gmail_v1.Params$Resource$Users$Messages$List = {
             userId: "me",
             maxResults: 50,
             q: "subject:(confirm OR welcome OR verify OR account OR signup)",
         };

         do {
             if (pageToken) listParams.pageToken = pageToken;
             const res = await gmail.users.messages.list(listParams);
             const batch = res.data.messages ?? [];

             const chunkSize = 10;
             for (let i = 0; i < batch.length; i += chunkSize) {
                 const chunk = batch.slice(i, i + chunkSize);
                 const fullMessages = await Promise.all(
                     chunk.map(msg => gmail.users.messages.get({ userId: "me", id: msg.id! }))
                 );
                 for (const full of fullMessages) {
                     const headers = full.data.payload?.headers ?? [];
                     const from = headers.find(h => h.name === "From")?.value ?? "";
                     const subject = headers.find(h => h.name === "Subject")?.value ?? "";
                     saved.push({ from, subject, savedAt: new Date() });
                 }
                 if (i + chunkSize < batch.length) {
                     await new Promise(r => setTimeout(r, 1000));
                 }
             }

             fs.writeFileSync(EMAILS_FILE, JSON.stringify(saved, null, 2));
             console.log(`[Scanner] ${saved.length} emails saved so far...`);

             pageToken = res.data.nextPageToken ?? undefined;
             if (pageToken) await new Promise(r => setTimeout(r, 1000));
         } while (pageToken);

         console.log(`[Scanner] Complete. ${saved.length} total emails.`);
     } catch (err) {
         console.error("[Scanner] Background scan failed:", err);
     }
 }


  export async function GET() {
      const session = await auth();
      if (!session?.user?.id) {
          return Response.json({ error: "Not authenticated" }, { status: 401 });
      }

    const q = query(
      collection(db, "users"),
      where("email", "==", session.user.email)
    );
    const snapshot = await getDocs(q);
     const userData = snapshot.docs[0]?.data();

    if (!userData?.accessToken) {
        return Response.json({ error: "No Google account linked" }, { status: 401 });
    }  
    // Fire-and-forget: start scan in background, don't await
     void runScanBackground(userData.accessToken);
     return Response.json({ status: "started" });
  }