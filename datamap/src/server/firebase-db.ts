import { adminDb as db } from "~/lib/firebase-admin";
import * as admin from "firebase-admin";

// Collection names
export const COLLECTIONS = {
	DISCOVERED_SERVICES: "discovered_services",
	RISK_RESULTS: "risk_results",
	POLICY_CACHE: "policy_cache",
	USERS: "users",
};

// Type alias for Timestamp
type Timestamp = admin.firestore.Timestamp;

// DiscoveredService Firestore document
export interface DiscoveredServiceDoc {
	userId: string;
	serviceName: string;
	domain: string;
	discoveredVia: string;
	firstSeenAt: Timestamp | admin.firestore.FieldValue | Date | any;
	lastSeenAt: Timestamp | admin.firestore.FieldValue | Date | any;
	lastUsedAt?: Timestamp | admin.firestore.FieldValue | Date | null;
	isActive: boolean;
	createdAt: Timestamp | admin.firestore.FieldValue | Date | any;
}

// RiskResult Firestore document
export interface RiskResultDoc {
	serviceId: string; // reference to discovered_services doc
	policyDataSelling: number;
	policyAiTraining: number;
	policyDeleteDifficulty: number;
	policySummary?: string;
	breachDetected: boolean;
	breachName?: string;
	breachYear?: number;
	score: number;
	tier: string;
	reasons: string[];
	scoredAt: Timestamp | admin.firestore.FieldValue;
}

// PolicyCache Firestore document
export interface PolicyCacheDoc {
	serviceName: string;
	domain: string;
	dataSelling: number;
	aiTraining: number;
	deleteDifficulty: number;
	summary?: string;
	source: string;
	policyVersion?: string;
	analyzedAt: Timestamp | admin.firestore.FieldValue;
}

/**
 * Get or create discovered service in Firestore
 */
export async function upsertDiscoveredService(
	userId: string,
	serviceName: string,
	domain: string,
	lastUsedAt?: Date,
): Promise<string> {
	const normalizedDomain = domain.trim().toLowerCase();
	const docId = `${userId}_${normalizedDomain}`;

	try {
		const docRef = db.collection(COLLECTIONS.DISCOVERED_SERVICES).doc(docId);
		const docSnap = await docRef.get();

		const now = admin.firestore.FieldValue.serverTimestamp();
		const data: DiscoveredServiceDoc = {
			userId,
			serviceName,
			domain: normalizedDomain,
			discoveredVia: "api",
			firstSeenAt: docSnap.exists ? docSnap.data()?.firstSeenAt ?? now : now,
			lastSeenAt: now,
			lastUsedAt: lastUsedAt ?? null,
			isActive: true,
			createdAt: docSnap.exists ? docSnap.data()?.createdAt ?? now : now,
		};

		await docRef.set(data, { merge: true });
		return docId;
	} catch (error) {
		console.error("Error upserting discovered service:", error);
		throw error;
	}
}

/**
 * Save risk result for a service
 */
export async function saveRiskResult(
	serviceId: string,
	policyDataSelling: number,
	policyAiTraining: number,
	policyDeleteDifficulty: number,
	policySummary: string | undefined,
	breachDetected: boolean,
	breachName: string | undefined,
	breachYear: number | undefined,
	score: number,
	tier: string,
	reasons: string[],
): Promise<string> {
	try {
		const riskDocId = `${serviceId}_${Date.now()}`;
		const docRef = db.collection(COLLECTIONS.RISK_RESULTS).doc(riskDocId);

		const data: RiskResultDoc = {
			serviceId,
			policyDataSelling,
			policyAiTraining,
			policyDeleteDifficulty,
			policySummary,
			breachDetected,
			breachName,
			breachYear,
			score,
			tier,
			reasons,
			scoredAt: admin.firestore.FieldValue.serverTimestamp(),
		};

		await docRef.set(data);
		return riskDocId;
	} catch (error) {
		console.error("Error saving risk result:", error);
		throw error;
	}
}

/**
 * Get latest risk result for a service domain by userId
 */
export async function getLatestRiskForDomain(
	userId: string,
	domain: string,
): Promise<(RiskResultDoc & { id: string }) | null> {
	try {
		const normalizedDomain = domain.trim().toLowerCase();
		const docId = `${userId}_${normalizedDomain}`;

		// Get service
		const serviceRef = db.collection(COLLECTIONS.DISCOVERED_SERVICES).doc(docId);
		const serviceSnap = await serviceRef.get();

		if (!serviceSnap.exists) {
			return null;
		}

		// Query risk results for this service
		const q = db
			.collection(COLLECTIONS.RISK_RESULTS)
			.where("serviceId", "==", docId)
			.orderBy("scoredAt", "desc")
			.limit(1);

		const querySnapshot = await q.get();

		if (querySnapshot.empty) {
			return null;
		}

		const riskDoc = querySnapshot.docs[0];
		if (!riskDoc) {
			return null;
		}

		return {
			id: riskDoc.id,
			...(riskDoc.data() as RiskResultDoc),
		};
	} catch (error) {
		console.error("Error getting latest risk for domain:", error);
		return null;
	}
}

/**
 * Get all services and their latest risks for a user
 */
export async function getUserServicesWithRisks(userId: string): Promise<
	Array<{
		id: string;
		serviceName: string;
		domain: string;
		lastUsedAt: Date | null;
		firstSeenAt: Date;
		risk: (RiskResultDoc & { id: string }) | null;
	}>
> {
	try {
		const q = db
			.collection(COLLECTIONS.DISCOVERED_SERVICES)
			.where("userId", "==", userId);

		const querySnapshot = await q.get();
		const services = [];

		for (const serviceDoc of querySnapshot.docs) {
			const serviceData = serviceDoc.data() as DiscoveredServiceDoc;

			// Get latest risk for this service
			const riskQ = db
				.collection(COLLECTIONS.RISK_RESULTS)
				.where("serviceId", "==", serviceDoc.id)
				.orderBy("scoredAt", "desc")
				.limit(1);

			const riskSnapshot = await riskQ.get();
			const riskDoc0 = riskSnapshot.docs[0];
			const risk = riskSnapshot.empty || !riskDoc0
				? null
				: ({
						id: riskDoc0.id,
						...(riskDoc0.data() as RiskResultDoc),
					} as RiskResultDoc & { id: string });

			const lastUsedData = serviceData.lastUsedAt as any;
			const firstSeenData = serviceData.firstSeenAt as any;

			services.push({
				id: serviceDoc.id,
				serviceName: serviceData.serviceName,
				domain: serviceData.domain,
				lastUsedAt: lastUsedData?.toDate?.() ?? null,
				firstSeenAt: firstSeenData?.toDate?.() ?? new Date(),
				risk,
			});
		}

		// Sort by risk score descending
		services.sort(
			(a, b) => (b.risk?.score ?? 0) - (a.risk?.score ?? 0),
		);

		return services;
	} catch (error) {
		console.error("Error getting user services with risks:", error);
		return [];
	}
}

/**
 * Get or create policy cache entry
 */
export async function getPolicyCached(
	domain: string,
): Promise<(PolicyCacheDoc & { id: string }) | null> {
	try {
		const normalizedDomain = domain.trim().toLowerCase();
		const docRef = db.collection(COLLECTIONS.POLICY_CACHE).doc(normalizedDomain);
		const docSnap = await docRef.get();

		if (!docSnap.exists) {
			return null;
		}

		return {
			id: docSnap.id,
			...(docSnap.data() as PolicyCacheDoc),
		};
	} catch (error) {
		console.error("Error getting cached policy:", error);
		return null;
	}
}

/**
 * Save or update policy cache
 */
export async function savePolicyCache(
	serviceName: string,
	domain: string,
	dataSelling: number,
	aiTraining: number,
	deleteDifficulty: number,
	summary: string | undefined,
	source: string,
): Promise<void> {
	try {
		const normalizedDomain = domain.trim().toLowerCase();
		const docRef = db.collection(COLLECTIONS.POLICY_CACHE).doc(normalizedDomain);

		const data: PolicyCacheDoc = {
			serviceName,
			domain: normalizedDomain,
			dataSelling,
			aiTraining,
			deleteDifficulty,
			summary,
			source,
			analyzedAt: admin.firestore.FieldValue.serverTimestamp(),
		};

		await docRef.set(data, { merge: true });
	} catch (error) {
		console.error("Error saving policy cache:", error);
		throw error;
	}
}
