export type PolicySignals = {
	dataSelling: number;
	aiTraining: number;
	deleteDifficulty: number;
	summary?: string;
};

export type BreachSignals = {
	wasBreached: boolean;
	breachName?: string;
	breachYear?: number;
};

export type UsageSignals = {
	lastUsedAt?: Date;
};

export type ServiceRiskInput = {
	serviceName: string;
	domain: string;
	policy: PolicySignals;
	breach: BreachSignals;
	usage: UsageSignals;
};

export type RiskTier = "red" | "yellow" | "green";

export type ServiceRiskResult = {
	serviceName: string;
	domain: string;
	score: number;
	tier: RiskTier;
	reasons: string[];
	deletePriority: number;
};

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function yearsSince(date?: Date): number | null {
	if (!date) return null;
	const now = new Date();
	return Math.max(0, now.getFullYear() - date.getFullYear());
}

export function scoreServiceRisk(input: ServiceRiskInput): ServiceRiskResult {
	const reasons: string[] = [];
	const staleYears = yearsSince(input.usage.lastUsedAt);

	const dataSelling = clamp(input.policy.dataSelling, 1, 10);
	const aiTraining = clamp(input.policy.aiTraining, 1, 10);
	const deleteDifficulty = clamp(input.policy.deleteDifficulty, 1, 10);

	const policyScore =
		dataSelling * 2.5 + aiTraining * 1.8 + deleteDifficulty * 1.7;

	let breachScore = 0;
	if (input.breach.wasBreached) {
		breachScore = 20;
		reasons.push("Known historical breach");

		if (
			input.breach.breachYear &&
			input.breach.breachYear <= new Date().getFullYear() - 3
		) {
			breachScore += 5;
			reasons.push("Older unresolved breach risk");
		}
	}

	let staleScore = 0;
	if (staleYears !== null && staleYears >= 2) {
		staleScore = Math.min(15, 5 + (staleYears - 2) * 3);
		reasons.push("Account appears unused for 2+ years");
	}

	const raw = policyScore + breachScore + staleScore;
	const score = clamp(Math.round(raw), 0, 100);

	let tier: RiskTier = "green";
	if (score >= 70) tier = "red";
	else if (score >= 40) tier = "yellow";

	if (dataSelling >= 7) {
		reasons.push("Policy indicates high data-selling risk");
	}
	if (aiTraining >= 7) {
		reasons.push("Policy indicates AI-training data use");
	}
	if (deleteDifficulty >= 7) {
		reasons.push("Deletion appears difficult");
	}

	const deletePriority =
		score + (tier === "red" ? 15 : tier === "yellow" ? 5 : 0);

	return {
		serviceName: input.serviceName,
		domain: input.domain,
		score,
		tier,
		reasons,
		deletePriority,
	};
}
