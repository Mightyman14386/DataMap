import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";

// Initialize Firebase Admin SDK with service account credentials
const serviceAccountPath = path.join(
	process.cwd(),
	"..",
	"firebase-service-account.json",
);

let adminApp: admin.app.App;

try {
	const serviceAccount = JSON.parse(
		fs.readFileSync(serviceAccountPath, "utf-8"),
	);

	if (!admin.apps.length) {
		adminApp = admin.initializeApp({
			credential: admin.credential.cert(serviceAccount),
			projectId: serviceAccount.project_id,
		});
	} else {
		adminApp = admin.app();
	}
} catch (error) {
	console.error("Failed to initialize Firebase Admin SDK:", error);
	// Fallback: try to use environment variables if file doesn't exist
	if (!admin.apps.length) {
		adminApp = admin.initializeApp({
			projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
		});
	} else {
		adminApp = admin.app();
	}
}

export const adminDb = admin.firestore(adminApp);
export const adminAuth = admin.auth(adminApp);
export default adminApp;
