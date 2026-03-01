import { auth } from "../../../../../server/auth.js";
  import { google } from "googleapis";
import { db} from "../../../../Firebase/firebase.js";
import { collection, query, where, getDocs, limit, doc, getDoc } from "firebase/firestore";

  export async function GET() {
      const session = await auth();

      if (!session?.user?.id) {
          return Response.json({ error: "Not authenticated" }, { status: 401 });
      }

    const userDoc = await getDoc(doc(db, "users", session.user.id));
    const userData = userDoc.data();
        if (!userData?.accessToken) {
            return Response.json({ error: "No Google account linked" }, { status: 401 });
        }

      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: userData?.accessToken });

      const gmail = google.gmail({ version: "v1", auth: oauth2Client });

      const messages = await gmail.users.messages.list({
          userId: "me",
          maxResults: 10,
      });

      return Response.json(messages.data);
  }