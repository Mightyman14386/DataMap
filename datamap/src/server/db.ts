import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require("../../firebase-service-account.json")),
  });
}

export const db = getFirestore();