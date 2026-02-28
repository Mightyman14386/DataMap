import postgres from "postgres";

function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

function yearsSince(date) {
	if (!date) return null;
	const now = new Date();
	return Math.max(0, now.getFullYear() - date.getFullYear());
}

function scoreServiceRisk(input) {
	const reasons = [];
	const staleYears = yearsSince(input.lastUsedAt);

	const dataSelling = clamp(input.policy.dataSelling, 1, 10);
	const aiTraining = clamp(input.policy.aiTraining, 1, 10);
	const deleteDifficulty = clamp(input.policy.deleteDifficulty, 1, 10);

	const policyScore =
		dataSelling * 2.5 + aiTraining * 1.8 + deleteDifficulty * 1.7;

	let breachScore = 0;
	if (input.breach.wasBreached) {
		breachScore = 20;
		reasons.push("Known historical breach");
		if (input.breach.breachYear <= new Date().getFullYear() - 3) {
			breachScore += 5;
			reasons.push("Older unresolved breach risk");
		}
	}

	let staleScore = 0;
	if (staleYears !== null && staleYears >= 2) {
		staleScore = Math.min(15, 5 + (staleYears - 2) * 3);
		reasons.push("Account appears unused for 2+ years");
	}

	const score = clamp(Math.round(policyScore + breachScore + staleScore), 0, 100);

	let tier = "green";
	if (score >= 70) tier = "red";
	else if (score >= 40) tier = "yellow";

	if (dataSelling >= 7) reasons.push("Policy indicates high data-selling risk");
	if (aiTraining >= 7) reasons.push("Policy indicates AI-training data use");
	if (deleteDifficulty >= 7) reasons.push("Deletion appears difficult");

	return { score, tier, reasons };
}

const DATABASE_URL = process.env.DATABASE_URL;
const DEMO_USER_EMAIL = process.env.DEMO_USER_EMAIL;

if (!DATABASE_URL) {
	console.error("Missing DATABASE_URL. Use: node --env-file=.env scripts/seed-risk-demo.mjs");
	process.exit(1);
}

const sql = postgres(DATABASE_URL);

const demoServices = [
	{
		serviceName: "LinkedIn",
		domain: "linkedin.com",
		lastUsedAt: new Date("2023-01-10T00:00:00.000Z"),
		policy: { dataSelling: 7, aiTraining: 8, deleteDifficulty: 6 },
		breach: { wasBreached: true, breachName: "LinkedIn", breachYear: 2021 },
		summary:
			"Broad data-sharing clauses and AI feature training language are present. Deletion is possible but retention exceptions are listed.",
	},
	{
		serviceName: "Canva",
		domain: "canva.com",
		lastUsedAt: new Date("2024-11-01T00:00:00.000Z"),
		policy: { dataSelling: 5, aiTraining: 7, deleteDifficulty: 5 },
		breach: { wasBreached: false, breachName: null, breachYear: null },
		summary:
			"Uses account data for product improvement including AI features. Deletion flow is moderate and account exports are available.",
	},
	{
		serviceName: "Dropbox",
		domain: "dropbox.com",
		lastUsedAt: new Date(),
		policy: { dataSelling: 2, aiTraining: 3, deleteDifficulty: 3 },
		breach: { wasBreached: false, breachName: null, breachYear: null },
		summary:
			"Policy language is relatively restrictive on selling data with clear security controls. Deletion and data export controls are straightforward.",
	},
];

try {
	const users = DEMO_USER_EMAIL
		? await sql`
				SELECT "id", "email"
				FROM "datamap_user"
				WHERE "email" = ${DEMO_USER_EMAIL}
				LIMIT 1
			`
		: await sql`
				SELECT "id", "email"
				FROM "datamap_user"
				ORDER BY "email"
				LIMIT 1
			`;

	if (users.length === 0) {
		console.error(
			"No users found. Sign in once via NextAuth first, then rerun this script.",
		);
		process.exit(1);
	}

	const user = users[0];
	console.log(`Seeding risk demo data for user ${user.email} (${user.id})`);

	for (const service of demoServices) {
		const upserted = await sql`
			INSERT INTO "datamap_discovered_service" (
				"userId",
				"serviceName",
				"domain",
				"discoveredVia",
				"firstSeenAt",
				"lastSeenAt",
				"lastUsedAt",
				"isActive"
			)
			VALUES (
				${user.id},
				${service.serviceName},
				${service.domain},
				${"demo_seed"},
				${new Date()},
				${new Date()},
				${service.lastUsedAt},
				${true}
			)
			ON CONFLICT ("userId", "domain") DO UPDATE
			SET
				"serviceName" = EXCLUDED."serviceName",
				"lastSeenAt" = EXCLUDED."lastSeenAt",
				"lastUsedAt" = EXCLUDED."lastUsedAt",
				"isActive" = EXCLUDED."isActive"
			RETURNING "id"
		`;

		const serviceId = upserted[0].id;
		const scored = scoreServiceRisk(service);

		await sql`
			INSERT INTO "datamap_risk_result" (
				"serviceId",
				"policyDataSelling",
				"policyAiTraining",
				"policyDeleteDifficulty",
				"policySummary",
				"breachDetected",
				"breachName",
				"breachYear",
				"score",
				"tier",
				"reasons",
				"scoredAt"
			)
			VALUES (
				${serviceId},
				${service.policy.dataSelling},
				${service.policy.aiTraining},
				${service.policy.deleteDifficulty},
				${service.summary},
				${service.breach.wasBreached},
				${service.breach.breachName},
				${service.breach.breachYear},
				${scored.score},
				${scored.tier},
				${scored.reasons},
				${new Date()}
			)
		`;
	}

	console.log(`Seed complete. Inserted/updated ${demoServices.length} services.`);
} finally {
	await sql.end({ timeout: 5 });
}
