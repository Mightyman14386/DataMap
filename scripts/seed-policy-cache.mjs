import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
	console.error("Missing DATABASE_URL");
	process.exit(1);
}

const sql = postgres(DATABASE_URL);

// Major tech/social companies with hardcoded privacy risk assessments for hackathon demo
const majorCompanies = [
	{
		serviceName: "TikTok",
		domain: "tiktok.com",
		dataSelling: 9,
		aiTraining: 9,
		deleteDifficulty: 8,
		summary:
			"TikTok aggressively collects user behavior data and explicitly trains AI models on user-generated content. Account deletion involves lengthy data retention periods.",
	},
	{
		serviceName: "Meta",
		domain: "facebook.com",
		dataSelling: 8,
		aiTraining: 8,
		deleteDifficulty: 6,
		summary:
			"Meta sells user data to advertisers and uses it for AI model training. Deletion is possible but data shadows remain for 90+ days.",
	},
	{
		serviceName: "Google",
		domain: "google.com",
		dataSelling: 7,
		aiTraining: 9,
		deleteDifficulty: 5,
		summary:
			"Google uses comprehensive data collection for ad targeting and heavily trains AI/ML systems. Deletion is relatively straightforward but takes time.",
	},
	{
		serviceName: "LinkedIn",
		domain: "linkedin.com",
		dataSelling: 7,
		aiTraining: 7,
		deleteDifficulty: 6,
		summary:
			"LinkedIn shares user data with third parties and uses it for AI training. Account deletion requires multi-step verification.",
	},
	{
		serviceName: "Amazon",
		domain: "amazon.com",
		dataSelling: 6,
		aiTraining: 7,
		deleteDifficulty: 4,
		summary:
			"Amazon collects purchase and behavioral data, uses it for recommendations and AI. Deletion process is clear but account history retained.",
	},
	{
		serviceName: "Twitter",
		domain: "twitter.com",
		dataSelling: 6,
		aiTraining: 7,
		deleteDifficulty: 5,
		summary:
			"Twitter shares user data with advertisers and trains recommendation models. Deletion is straightforward but data archival period is long.",
	},
	{
		serviceName: "Instagram",
		domain: "instagram.com",
		dataSelling: 8,
		aiTraining: 8,
		deleteDifficulty: 6,
		summary:
			"Instagram (Meta) uses extensive data collection for ad targeting and AI model training. Deletion follows Meta corporate policy.",
	},
	{
		serviceName: "Spotify",
		domain: "spotify.com",
		dataSelling: 5,
		aiTraining: 6,
		deleteDifficulty: 4,
		summary:
			"Spotify collects listening data for recommendations and shares with partners. Deletion is straightforward without extended retention.",
	},
	{
		serviceName: "Dropbox",
		domain: "dropbox.com",
		dataSelling: 2,
		aiTraining: 3,
		deleteDifficulty: 3,
		summary:
			"Dropbox has strong privacy controls. Minimal data selling and AI use. Clean deletion with no extended retention.",
	},
	{
		serviceName: "Apple",
		domain: "apple.com",
		dataSelling: 2,
		aiTraining: 4,
		deleteDifficulty: 3,
		summary:
			"Apple emphasizes privacy and limits data selling. Uses data for on-device AI only. Straightforward account deletion.",
	},
];

async function seedPolicies() {
	try {
		for (const company of majorCompanies) {
			await sql`
				INSERT INTO "datamap_policy_cache" (
					"serviceName",
					"domain",
					"dataSelling",
					"aiTraining",
					"deleteDifficulty",
					"summary",
					"source",
					"analyzedAt"
				)
				VALUES (
					${company.serviceName},
					${company.domain},
					${company.dataSelling},
					${company.aiTraining},
					${company.deleteDifficulty},
					${company.summary},
					${"seed_hackathon"},
					${new Date()}
				)
				ON CONFLICT ("domain") DO UPDATE
				SET
					"serviceName" = EXCLUDED."serviceName",
					"dataSelling" = EXCLUDED."dataSelling",
					"aiTraining" = EXCLUDED."aiTraining",
					"deleteDifficulty" = EXCLUDED."deleteDifficulty",
					"summary" = EXCLUDED."summary",
					"analyzedAt" = EXCLUDED."analyzedAt"
			`;
		}

		console.log(`Seeded ${majorCompanies.length} companies to policy_cache.`);
	} catch (error) {
		console.error("Seed error:", error);
	} finally {
		await sql.end({ timeout: 5 });
	}
}

seedPolicies();
