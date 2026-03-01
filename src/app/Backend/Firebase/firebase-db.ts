/**
 * Database operations abstraction layer supporting both Firestore and PostgreSQL
 */

import { getFirestore, collection, addDoc, doc, setDoc, getDoc, updateDoc, query, where, getDocs, orderBy, limit, Timestamp, QueryConstraint } from "firebase/firestore";

// Types for database operations
export interface DiscoveredService {
	id: string;
	userId: string;
	serviceName: string;
	domain: string;
	discoveredVia: string;
	firstSeenAt: Date;
	lastSeenAt: Date;
	lastUsedAt?: Date;
	isActive: boolean;
}

export interface RiskResult {
	id: string;
	serviceId: string;
	policyDataSelling: number;
	policyAiTraining: number;
	policyDeleteDifficulty: number;
	policySummary?: string;
	breachDetected: boolean;
	breachName?: string;
	breachYear?: number;
	score: number;
	tier: "red" | "yellow" | "green";
	reasons: string[];
	scoredAt: Date;
}

export interface PolicyCache {
	id: string;
	serviceName: string;
	domain: string;
	dataSelling: number;
	aiTraining: number;
	deleteDifficulty: number;
	summary: string;
	source: string;
	analyzedAt: Date;
}

export interface User {
	id: string;
	email: string;
}

export interface ServiceWithRisk extends DiscoveredService {
	risk?: RiskResult;
}

const db = getFirestore();

/**
 * Upsert a discovered service - insert or update if exists
 */
export async function upsertDiscoveredService(
	userId: string,
	serviceName: string,
	domain: string,
	lastUsedAt?: Date
): Promise<string> {
	try {
		const servicesRef = collection(db, "datamap_discovered_service");
		const q = query(
			servicesRef,
			where("userId", "==", userId),
			where("domain", "==", domain)
		);
		const existing = await getDocs(q);

		const now = new Date();
		const data = {
			userId,
			serviceName,
			domain,
			discoveredVia: "api",
			firstSeenAt: now,
			lastSeenAt: now,
			lastUsedAt: lastUsedAt || now,
			isActive: true,
		};

		if (existing.docs.length > 0) {
			const docId = existing.docs[0].id;
			await updateDoc(doc(db, "datamap_discovered_service", docId), {
				...data,
				firstSeenAt: existing.docs[0].data().firstSeenAt, // preserve original creation time
			});
			return docId;
		} else {
			const docRef = await addDoc(servicesRef, data);
			return docRef.id;
		}
	} catch (error) {
		console.error("Error upserting discovered service:", error);
		throw error;
	}
}

/**
 * Save a risk result to database
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
	tier: "red" | "yellow" | "green" | "neutral",
	reasons: string[]
): Promise<string> {
	try {
		const resultsRef = collection(db, "datamap_risk_result");
		const docRef = await addDoc(resultsRef, {
			serviceId,
			policyDataSelling,
			policyAiTraining,
			policyDeleteDifficulty,
			policySummary: policySummary || null,
			breachDetected,
			breachName: breachName || null,
			breachYear: breachYear || null,
			score,
			tier,
			reasons,
			scoredAt: Timestamp.now(),
		});
		return docRef.id;
	} catch (error) {
		console.error("Error saving risk result:", error);
		throw error;
	}
}

/**
 * Save deletion/account removal information for a service
 */
export async function saveDeletionInfo(
	riskId: string,
	availability: "available" | "limited" | "unknown",
	accountDeletionUrl?: string,
	dataDeletionUrl?: string,
	retentionWindow?: string,
	instructions?: string,
	source?: "llm" | "heuristic" | "default"
): Promise<string> {
	try {
		const deletionRef = collection(db, "datamap_deletion_info");
		const docRef = await addDoc(deletionRef, {
			riskId,
			availability,
			accountDeletionUrl: accountDeletionUrl || null,
			dataDeletionUrl: dataDeletionUrl || null,
			retentionWindow: retentionWindow || null,
			instructions: instructions || null,
			source: source || "default",
			savedAt: Timestamp.now(),
		});
		return docRef.id;
	} catch (error) {
		console.error("Error saving deletion info:", error);
		throw error;
	}
}

/**
 * Get cached policy data for a domain
 */
export async function getPolicyCached(domain: string): Promise<PolicyCache | null> {
	try {
		const cacheRef = collection(db, "datamap_policy_cache");
		const q = query(cacheRef, where("domain", "==", domain));
		const result = await getDocs(q);

		if (result.docs.length === 0) return null;

		const data = result.docs[0].data();
		return {
			id: result.docs[0].id,
			serviceName: data.serviceName,
			domain: data.domain,
			dataSelling: data.dataSelling,
			aiTraining: data.aiTraining,
			deleteDifficulty: data.deleteDifficulty,
			summary: data.summary,
			source: data.source,
			analyzedAt: data.analyzedAt?.toDate ? data.analyzedAt.toDate() : new Date(data.analyzedAt),
		};
	} catch (error) {
		console.error("Error getting cached policy:", error);
		return null;
	}
}

/**
 * Save policy analysis to cache
 */
export async function savePolicyCache(
	serviceName: string,
	domain: string,
	dataSelling: number,
	aiTraining: number,
	deleteDifficulty: number,
	summary: string,
	source: string
): Promise<string> {
	try {
		const cacheRef = collection(db, "datamap_policy_cache");
		const q = query(cacheRef, where("domain", "==", domain));
		const existing = await getDocs(q);

		const data = {
			serviceName,
			domain,
			dataSelling,
			aiTraining,
			deleteDifficulty,
			summary,
			source,
			analyzedAt: Timestamp.now(),
		};

		if (existing.docs.length > 0) {
			const docId = existing.docs[0].id;
			await updateDoc(doc(db, "datamap_policy_cache", docId), data);
			return docId;
		} else {
			const docRef = await addDoc(cacheRef, data);
			return docRef.id;
		}
	} catch (error) {
		console.error("Error saving policy cache:", error);
		throw error;
	}
}

/**
 * Get latest risk result for a domain
 */
export async function getLatestRiskForDomain(
	userId: string,
	domain: string
): Promise<RiskResult | null> {
	try {
		const servicesRef = collection(db, "datamap_discovered_service");
		const q = query(
			servicesRef,
			where("userId", "==", userId),
			where("domain", "==", domain)
		);
		const serviceResult = await getDocs(q);

		if (serviceResult.docs.length === 0) return null;

		const serviceId = serviceResult.docs[0].id;

		const risksRef = collection(db, "datamap_risk_result");
		const riskQuery = query(
			risksRef,
			where("serviceId", "==", serviceId),
			orderBy("scoredAt", "desc"),
			limit(1)
		);
		const riskResult = await getDocs(riskQuery);

		if (riskResult.docs.length === 0) return null;

		const data = riskResult.docs[0].data();
		return {
			id: riskResult.docs[0].id,
			serviceId: data.serviceId,
			policyDataSelling: data.policyDataSelling,
			policyAiTraining: data.policyAiTraining,
			policyDeleteDifficulty: data.policyDeleteDifficulty,
			policySummary: data.policySummary,
			breachDetected: data.breachDetected,
			breachName: data.breachName,
			breachYear: data.breachYear,
			score: data.score,
			tier: data.tier,
			reasons: data.reasons || [],
			scoredAt: data.scoredAt?.toDate ? data.scoredAt.toDate() : new Date(data.scoredAt),
		};
	} catch (error) {
		console.error("Error getting latest risk:", error);
		throw error;
	}
}

/**
 * Get all services with their risk results for a user
 */
export async function getUserServicesWithRisks(
	userId: string
): Promise<ServiceWithRisk[]> {
	try {
		const servicesRef = collection(db, "datamap_discovered_service");
		const q = query(servicesRef, where("userId", "==", userId));
		const servicesResult = await getDocs(q);

		const services: ServiceWithRisk[] = [];

		for (const serviceDoc of servicesResult.docs) {
			const serviceData = serviceDoc.data();
			const riskQuery = query(
				collection(db, "datamap_risk_result"),
				where("serviceId", "==", serviceDoc.id),
				orderBy("scoredAt", "desc"),
				limit(1)
			);
			const riskResult = await getDocs(riskQuery);

			const service: ServiceWithRisk = {
				id: serviceDoc.id,
				userId: serviceData.userId,
				serviceName: serviceData.serviceName,
				domain: serviceData.domain,
				discoveredVia: serviceData.discoveredVia,
				firstSeenAt: serviceData.firstSeenAt?.toDate ? serviceData.firstSeenAt.toDate() : new Date(serviceData.firstSeenAt),
				lastSeenAt: serviceData.lastSeenAt?.toDate ? serviceData.lastSeenAt.toDate() : new Date(serviceData.lastSeenAt),
				lastUsedAt: serviceData.lastUsedAt?.toDate ? serviceData.lastUsedAt.toDate() : serviceData.lastUsedAt,
				isActive: serviceData.isActive,
			};

			if (riskResult.docs.length > 0) {
				const riskData = riskResult.docs[0].data();
				service.risk = {
					id: riskResult.docs[0].id,
					serviceId: riskData.serviceId,
					policyDataSelling: riskData.policyDataSelling,
					policyAiTraining: riskData.policyAiTraining,
					policyDeleteDifficulty: riskData.policyDeleteDifficulty,
					policySummary: riskData.policySummary,
					breachDetected: riskData.breachDetected,
					breachName: riskData.breachName,
					breachYear: riskData.breachYear,
					score: riskData.score,
					tier: riskData.tier,
					reasons: riskData.reasons || [],
					scoredAt: riskData.scoredAt?.toDate ? riskData.scoredAt.toDate() : new Date(riskData.scoredAt),
				};
			}

			services.push(service);
		}

		return services;
	} catch (error) {
		console.error("Error getting user services with risks:", error);
		throw error;
	}
}
