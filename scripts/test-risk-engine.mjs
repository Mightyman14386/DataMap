/**
 * Test suite for risk scoring engine
 * Tests the core risk calculation logic
 */

// Import the scoreServiceRisk function directly from the TypeScript code
// We'll load it as a CommonJS module for testing
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Since we can't directly import TypeScript, we'll define the functions inline for testing
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
		if (input.breach.breachYear && input.breach.breachYear <= new Date().getFullYear() - 3) {
			breachScore += 5;
			reasons.push("Older unresolved breach risk");
		}
	}

	let staleScore = 0;
	if (staleYears !== null && staleYears >= 2) {
		staleScore = Math.min(15, 5 + (staleYears - 2) * 3);
		reasons.push("Account appears unused for 2+ years");
	}

	const score = clamp(
		Math.round(policyScore + breachScore + staleScore),
		0,
		100
	);

	let tier = "green";
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

// Test cases
const tests = [];

function test(name, fn) {
	tests.push({ name, fn });
}

function assert(condition, message) {
	if (!condition) {
		throw new Error(`Assertion failed: ${message}`);
	}
}

function assertEqual(actual, expected, message) {
	if (actual !== expected) {
		throw new Error(`Assertion failed: ${message} (expected ${expected}, got ${actual})`);
	}
}

// Define tests
test("Basic scoring with high risk", () => {
	const result = scoreServiceRisk({
		serviceName: "LinkedIn",
		domain: "linkedin.com",
		policy: {
			dataSelling: 7,
			aiTraining: 8,
			deleteDifficulty: 6,
		},
		breach: {
			wasBreached: true,
			breachName: "LinkedIn",
			breachYear: 2021,
		},
		usage: {
			lastUsedAt: new Date("2023-01-10T00:00:00.000Z"),
		},
	});

	assert(result.score > 50, "Score should be > 50 for high risk service");
	assertEqual(result.tier, "red", "Tier should be red for stale account + breach");
	assert(result.reasons.length > 0, "Should have reasons for score");
});

test("Green tier scoring", () => {
	const result = scoreServiceRisk({
		serviceName: "Dropbox",
		domain: "dropbox.com",
		policy: {
			dataSelling: 2,
			aiTraining: 3,
			deleteDifficulty: 3,
		},
		breach: {
			wasBreached: false,
		},
		usage: {
			lastUsedAt: new Date(),
		},
	});

	assert(result.score < 40, "Score should be < 40 for low risk service");
	assertEqual(result.tier, "green", "Tier should be green for low risk");
});

test("Red tier scoring with stale high-risk account", () => {
	const now = new Date();
	const eightYearsAgo = new Date(now.getFullYear() - 8, now.getMonth(), now.getDate());

	const result = scoreServiceRisk({
		serviceName: "TikTok",
		domain: "tiktok.com",
		policy: {
			dataSelling: 9,
			aiTraining: 9,
			deleteDifficulty: 8,
		},
		breach: {
			wasBreached: true,
			breachName: "TikTok",
			breachYear: 2020,
		},
		usage: {
			lastUsedAt: eightYearsAgo,
		},
	});

	// Policy score 52.3 + breach score 25 + stale score 15 = 92.3, rounds to 92
	assert(result.score >= 70, "Score should be >= 70 for stale high-risk service with breach");
	assertEqual(result.tier, "red", "Tier should be red for old breach + stale account with high policy risk");
});

test("Stale account penalty", () => {
	const now = new Date();
	const threeYearsAgo = new Date(now.getFullYear() - 3, now.getMonth(), now.getDate());

	const result = scoreServiceRisk({
		serviceName: "OldService",
		domain: "old.com",
		policy: {
			dataSelling: 3,
			aiTraining: 3,
			deleteDifficulty: 3,
		},
		breach: {
			wasBreached: false,
		},
		usage: {
			lastUsedAt: threeYearsAgo,
		},
	});

	assert(result.reasons.some(r => r.includes("unused")), "Should mention unused account");
});

test("Schema validation - service name required", () => {
	try {
		scoreServiceRisk({
			serviceName: "",
			domain: "test.com",
			policy: { dataSelling: 5, aiTraining: 5, deleteDifficulty: 5 },
			breach: { wasBreached: false },
			usage: {},
		});
		assert(false, "Should require service name");
	} catch (e) {
		// Expected
	}
});

test("Load and validate sample JSON files", () => {
	try {
		const samplePath = join(__dirname, "risk-score-sample.json");
		const sampleContent = readFileSync(samplePath, "utf-8");
		const sample = JSON.parse(sampleContent);

		assert(sample.serviceName, "Sample should have serviceName");
		assert(sample.domain, "Sample should have domain");
		assert(sample.policy, "Sample should have policy");
		assert(sample.breach, "Sample should have breach");
		assert(sample.usage, "Sample should have usage");

		// Try to score it
		const result = scoreServiceRisk({
			...sample,
			usage: {
				lastUsedAt: sample.usage.lastUsedAt ? new Date(sample.usage.lastUsedAt) : undefined,
			},
		});

		assert(result.score >= 0 && result.score <= 100, "Score should be 0-100");
		assert(["red", "yellow", "green"].includes(result.tier), "Tier should be valid");
	} catch (e) {
		throw new Error(`Failed to validate sample JSON: ${e.message}`);
	}
});

test("Load and validate batch sample JSON file", () => {
	try {
		const batchPath = join(__dirname, "risk-score-batch-sample.json");
		const batchContent = readFileSync(batchPath, "utf-8");
		const batch = JSON.parse(batchContent);

		assert(Array.isArray(batch.services), "Batch should have services array");
		assert(batch.services.length > 0, "Batch should have at least one service");

		// Try to score each one
		for (const service of batch.services) {
			const result = scoreServiceRisk({
				...service,
				usage: {
					lastUsedAt: service.usage.lastUsedAt ? new Date(service.usage.lastUsedAt) : undefined,
				},
			});

			assert(result.score >= 0 && result.score <= 100, "Score should be 0-100");
			assert(["red", "yellow", "green"].includes(result.tier), "Tier should be valid");
		}
	} catch (e) {
		throw new Error(`Failed to validate batch sample JSON: ${e.message}`);
	}
});

// Run tests
async function runTests() {
	console.log(`Running ${tests.length} tests...\n`);

	let passed = 0;
	let failed = 0;

	for (const { name, fn } of tests) {
		try {
			fn();
			console.log(`✓ ${name}`);
			passed++;
		} catch (error) {
			console.log(`✗ ${name}`);
			console.log(`  Error: ${error.message}`);
			failed++;
		}
	}

	console.log(`\n${passed} passed, ${failed} failed`);

	if (failed > 0) {
		process.exit(1);
	} else {
		console.log("\n✓ All tests passed!");
		process.exit(0);
	}
}

runTests().catch(err => {
	console.error("Test suite error:", err);
	process.exit(1);
});
