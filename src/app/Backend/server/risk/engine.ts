/**
 * Risk scoring engine for services based on policy analysis and breach history
 */

export interface ServiceInput {
	serviceName: string;
	domain: string;
	policy: {
		dataSelling: number; // 1-10
		aiTraining: number; // 1-10
		deleteDifficulty: number; // 1-10
		summary?: string;
	};
	breach: {
		wasBreached: boolean;
		breachName?: string;
		breachYear?: number;
	};
	usage: {
		lastUsedAt?: Date;
	};
	isDataUnavailable?: boolean; // True when policy analysis couldn't be retrieved
}

export interface RiskScore {
	serviceName: string;
	domain: string;
	score: number; // 0-100
	tier: "green" | "yellow" | "red" | "neutral";
	reasons: string[];
	deletePriority?: number;
	isDataUnavailable?: boolean; // True when analysis couldn't be performed
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function yearsSince(date?: Date): number | null {
	if (!date) return null;
	const now = new Date();
	return Math.max(0, now.getFullYear() - date.getFullYear());
}

/**
 * Score a service based on its privacy policy and breach history
 */
export function scoreServiceRisk(input: ServiceInput): RiskScore {
	const reasons: string[] = [];
	const staleYears = yearsSince(input.usage.lastUsedAt);

	// Clamp policy scores to 1-10
	const dataSelling = clamp(input.policy.dataSelling, 1, 10);
	const aiTraining = clamp(input.policy.aiTraining, 1, 10);
	const deleteDifficulty = clamp(input.policy.deleteDifficulty, 1, 10);

	// Calculate policy risk score (weights influence relative importance)
	const policyScore =
		dataSelling * 2.5 + aiTraining * 1.8 + deleteDifficulty * 1.7;

	// Calculate breach risk score
	let breachScore = 0;
	if (input.breach.wasBreached) {
		breachScore = 20;
		reasons.push("Known historical breach");
		if (input.breach.breachYear && input.breach.breachYear <= new Date().getFullYear() - 3) {
			breachScore += 5;
			reasons.push("Older unresolved breach risk");
		}
	}

	// Calculate staleness risk score
	let staleScore = 0;
	if (staleYears !== null && staleYears >= 2) {
		staleScore = Math.min(15, 5 + (staleYears - 2) * 3);
		reasons.push("Account appears unused for 2+ years");
	}

	// Combine all scores with clamping to 0-100
	const score = clamp(
		Math.round(policyScore + breachScore + staleScore),
		0,
		100
	);

	// Determine risk tier
	let tier: "green" | "yellow" | "red" | "neutral" = "green";

	if (input.breach.wasBreached) {
		// Any confirmed breach automatically makes it red
		tier = "red";
	} else if (input.isDataUnavailable) {
		tier = "neutral";
		reasons.push("Insufficient data to assess risk level");
	} else if (score >= 70) {
		tier = "red";
	} else if (score >= 40) {
		tier = "yellow";
	}

	console.log(`[Risk Scoring] ${input.serviceName}: score=${score}, tier=${tier}, policy(selling=${dataSelling}, ai=${aiTraining}, delete=${deleteDifficulty})`);


	// Add policy-specific reasons
	if (dataSelling >= 7) {
		reasons.push("Policy indicates high data-selling risk");
	}
	if (aiTraining >= 7) {
		reasons.push("Policy indicates AI-training data use");
	}
	if (deleteDifficulty >= 7) {
		reasons.push("Deletion appears difficult");
	}

	// Calculate delete priority (higher = more urgent to delete)
	// Based on score and deletion difficulty
	const deletePriority = Math.max(
		0,
		Math.round((score / 100) * 100 - deleteDifficulty * 3)
	);

	return {
		serviceName: input.serviceName,
		domain: input.domain,
		score,
		tier,
		reasons,
		deletePriority,
	};
}
