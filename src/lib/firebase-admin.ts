/**
 * Firebase Admin SDK initialization
 */

import admin from "firebase-admin";

const projectId = process.env.REACT_APP_FIREBASE_PROJECT_ID;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

if (!projectId || !privateKey || !clientEmail) {
	console.warn("Firebase Admin credentials not fully configured");
}

let adminApp = admin.apps[0];

if (!adminApp) {
	try {
		adminApp = admin.initializeApp({
			projectId,
			privateKey,
			clientEmail,
		});
	} catch (error) {
		console.error("Failed to initialize Firebase Admin:", error);
	}
}

export const adminDb = admin.firestore(adminApp);
export const adminAuth = admin.auth(adminApp);
