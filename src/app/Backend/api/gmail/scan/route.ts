import { auth } from "../../../server/auth.js";
  import { google } from "googleapis";
import { db} from "../../../Firebase/firebase.js";
import { collection, query, where, getDocs, limit, doc, getDoc, setDoc } from "firebase/firestore";
import path from "path/win32";
import fs from "fs";

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

      const fullMessages = await Promise.all(                                                                     
      (messages.data.messages ?? []).map((msg) =>                                                          
         gmail.users.messages.get({ userId: "me", id: msg.id! })                                             
       )                                                                                                       
    );

    const saved = [];                                                                                           
          for (const res of fullMessages) {                                                                           
              const headers = res.data.payload?.headers ?? [];                                                        
              const emailData = {                                                                                     
                 id: res.data.id,                                                                                    
                  subject: headers.find(h => h.name === "Subject")?.value ?? null,                                    
                  from: headers.find(h => h.name === "From")?.value ?? null,                                          
                  date: headers.find(h => h.name === "Date")?.value ?? null,                                          
                  snippet: res.data.snippet ?? null,                                                                  
                  savedAt: new Date(),                                                                                
              };                                                                                                      
              fs.writeFileSync(
              path.join(process.cwd(), "emails.json"),
              JSON.stringify(saved, null, 2)
  );                                                                                                   
              saved.push(emailData);                                                                                  
          }                                                                                                           
    return Response.json({ saved: saved.length, messages: saved });

  }