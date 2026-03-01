/**
 * Get cached analysis results for dashboard
 * Does NOT re-run analysis, just retrieves stored results
 */
import { auth } from "../../../server/auth";
import { db } from "../../../Firebase/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { NextResponse } from "next/server";

export async function GET() {
	try {
		const session = await auth();
		if (!session?.user?.id || !session?.user?.email) {
			return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
		}

		console.log("[Dashboard] Fetching analysis for user:", session.user.email);

		// Get all discovered services for this user from Firebase
		// Use email as userId to match how we save in auth.ts
		// Add a 15 second timeout to prevent hanging
		const servicesRef = collection(db, "datamap_discovered_service");
		const servicesQuery = query(servicesRef, where("userId", "==", session.user.email));
		
		const servicesPromise = getDocs(servicesQuery);
		const timeoutPromise = new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error("Dashboard query timeout")), 15000)
		);
		
		let servicesSnapshot;
		try {
			servicesSnapshot = await Promise.race([servicesPromise, timeoutPromise]);
		} catch (error) {
			console.error("[Dashboard] Query timeout or error:", error);
			return NextResponse.json({
				count: 0,
				summary: { red: 0, yellow: 0, green: 0 },
				results: [],
				isEmpty: true,
				message: "No analysis results found yet. Try running a scan."
			});
		}

		console.log("[Dashboard] Found services:", servicesSnapshot.size);

		if (servicesSnapshot.empty) {
			return NextResponse.json({
				count: 0,
				summary: { red: 0, yellow: 0, green: 0 },
				results: [],
				isEmpty: true,
				message: "No analysis results found. Run a scan first."
			});
		}

		// Get risk scores for all services
		const risksRef = collection(db, "datamap_risk_result");
		const risksSnapshot = await getDocs(risksRef);
		const risksByServiceId: Record<string, any> = {};
		const riskIds: string[] = [];
		
		risksSnapshot.forEach(doc => {
			risksByServiceId[doc.data().serviceId] = doc.data();
			riskIds.push(doc.id);
		});

		// Get deletion info for all risks
		const deletionInfoRef = collection(db, "datamap_deletion_info");
		const deletionInfoByRiskId: Record<string, any> = {};
		
		if (riskIds.length > 0) {
			const deletionSnapshot = await getDocs(deletionInfoRef);
			deletionSnapshot.forEach(doc => {
				const data = doc.data();
				deletionInfoByRiskId[data.riskId] = data;
			});
		}

		// Build results
		const results: any[] = [];
		let redCount = 0;
		let yellowCount = 0;
		let greenCount = 0;
		let neutralCount = 0;

		servicesSnapshot.forEach(doc => {
			const service = doc.data();
			const risk = risksByServiceId[doc.id];
			const deletionInfo = deletionInfoByRiskId[doc.id];

			// Log breach info for debugging
			if (risk?.breachDetected) {
				console.log(`[Dashboard] Breach found for ${service.serviceName}: ${risk.breachName}`);
			}

			const result = {
				service: {
					id: doc.id,
					serviceName: service.serviceName,
					domain: service.domain,
				},
				risk: risk || { score: 5, tier: "yellow" },
				policyAnalysis: {
					dataSelling: risk?.policyDataSelling || 5,
					aiTraining: risk?.policyAiTraining || 5,
					deleteDifficulty: risk?.policyDeleteDifficulty || 5,
					summary: risk?.policySummary || "No analysis available",
				},
				breachInfo: {
					wasBreached: risk?.breachDetected || false,
					breachName: risk?.breachName || undefined,
					breachYear: risk?.breachYear || undefined,
					breachCheckStatus: "ok" as const,
				},
				deletionInfo: deletionInfo ? {
					availability: deletionInfo.availability || "unknown",
					accountDeletionUrl: deletionInfo.accountDeletionUrl,
					dataDeletionUrl: deletionInfo.dataDeletionUrl,
					retentionWindow: deletionInfo.retentionWindow,
					instructions: deletionInfo.instructions,
					source: deletionInfo.source || "default",
				} : undefined,
			};

			results.push(result);

			// Count tiers
			if (risk?.tier === "red") redCount++;
			else if (risk?.tier === "yellow") yellowCount++;
			else if (risk?.tier === "neutral") neutralCount++;
			else greenCount++;
		});

		return NextResponse.json({
			count: results.length,
			summary: {
				red: redCount,
				yellow: yellowCount,
				green: greenCount,
				neutral: neutralCount,
			},
			results,
			isEmpty: false,
		});
	} catch (error) {
		console.error("[Dashboard Analysis] Error:", error);
		return NextResponse.json(
			{ error: "Failed to load analysis results", details: String(error) },
			{ status: 500 }
		);
	}
}
