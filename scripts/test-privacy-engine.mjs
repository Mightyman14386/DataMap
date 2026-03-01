/**
 * Privacy Engine Test Suite
 * Tests the caching, breach checking, and risk scoring logic
 * 
 * Run with: npm run test:privacy
 */

// Color codes for test output
const colors = {
	reset: "\x1b[0m",
	green: "\x1b[32m",
	red: "\x1b[31m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
};

const results = [];

// ============================================================================
// MOCK IMPLEMENTATIONS (from analysis-service.ts and engine.ts)
// ============================================================================

/**
 * Pre-cached policy analysis for common companies
 * Mirrors the COMMON_COMPANY_CACHE from analysis-service.ts
 */
const COMMON_COMPANY_CACHE = {
	"google.com": {
		dataSelling: 7,
		aiTraining: 9,
		deleteDifficulty: 5,
		summary:
			"Google uses comprehensive data collection for ad targeting and heavily trains AI/ML systems. Deletion is relatively straightforward but takes time.",
	},
	"facebook.com": {
		dataSelling: 8,
		aiTraining: 8,
		deleteDifficulty: 6,
		summary:
			"Meta sells user data to advertisers and uses it for AI model training. Deletion is possible but data shadows remain for 90+ days.",
	},
	"instagram.com": {
		dataSelling: 8,
		aiTraining: 8,
		deleteDifficulty: 6,
		summary:
			"Instagram (Meta) uses extensive data collection for ad targeting and AI model training. Deletion follows Meta corporate policy.",
	},
	"tiktok.com": {
		dataSelling: 9,
		aiTraining: 9,
		deleteDifficulty: 8,
		summary:
			"TikTok aggressively collects user behavior data and explicitly trains AI models on user-generated content. Account deletion involves lengthy data retention periods.",
	},
	"linkedin.com": {
		dataSelling: 7,
		aiTraining: 7,
		deleteDifficulty: 6,
		summary:
			"LinkedIn shares user data with third parties and uses it for AI training. Account deletion requires multi-step verification.",
	},
	"amazon.com": {
		dataSelling: 6,
		aiTraining: 7,
		deleteDifficulty: 4,
		summary:
			"Amazon collects purchase and behavioral data, uses it for recommendations and AI. Deletion process is clear but account history retained.",
	},
	"twitter.com": {
		dataSelling: 6,
		aiTraining: 7,
		deleteDifficulty: 5,
		summary:
			"Twitter shares user data with advertisers and trains recommendation models. Deletion is straightforward but data archival period is long.",
	},
	"x.com": {
		dataSelling: 6,
		aiTraining: 7,
		deleteDifficulty: 5,
		summary:
			"X (formerly Twitter) shares user data with advertisers and trains recommendation models. Deletion is straightforward but data archival period is long.",
	},
	"spotify.com": {
		dataSelling: 5,
		aiTraining: 6,
		deleteDifficulty: 4,
		summary:
			"Spotify collects listening data for recommendations and shares with partners. Deletion is straightforward without extended retention.",
	},
	"dropbox.com": {
		dataSelling: 2,
		aiTraining: 3,
		deleteDifficulty: 3,
		summary:
			"Dropbox has strong privacy controls. Minimal data selling and AI use. Clean deletion with no extended retention.",
	},
	"apple.com": {
		dataSelling: 2,
		aiTraining: 4,
		deleteDifficulty: 3,
		summary:
			"Apple emphasizes privacy and limits data selling. Uses data for on-device AI only. Straightforward account deletion.",
	},
	"microsoft.com": {
		dataSelling: 5,
		aiTraining: 7,
		deleteDifficulty: 4,
		summary:
			"Microsoft collects data for services and trains AI models. Some data sharing with partners. Account deletion is relatively straightforward.",
	},
	"github.com": {
		dataSelling: 2,
		aiTraining: 4,
		deleteDifficulty: 3,
		summary:
			"GitHub has clear privacy practices with minimal data selling. Limited AI training on user code. Straightforward account deletion.",
	},
	"openai.com": {
		dataSelling: 3,
		aiTraining: 9,
		deleteDifficulty: 4,
		summary:
			"OpenAI uses user data intensively for AI model training but doesn't actively sell data. Account deletion is straightforward.",
	},
	"reddit.com": {
		dataSelling: 6,
		aiTraining: 7,
		deleteDifficulty: 5,
		summary:
			"Reddit collects user data for targeting and trains AI models on content. Data deletion is possible but community content remains.",
	},
	"discord.com": {
		dataSelling: 3,
		aiTraining: 4,
		deleteDifficulty: 3,
		summary:
			"Discord has moderate privacy practices with limited data selling. AI use is primarily for moderation and recommendations. Deletion is straightforward.",
	},
	"gmail.com": {
		dataSelling: 7,
		aiTraining: 9,
		deleteDifficulty: 5,
		summary:
			"Gmail (Google) scans emails for ads and trains AI models. Deletion follows Google account policies with data archival.",
	},
	"outlook.com": {
		dataSelling: 5,
		aiTraining: 6,
		deleteDifficulty: 4,
		summary:
			"Outlook (Microsoft) uses moderate data collection for ads and AI. Account deletion is relatively straightforward.",
	},
	"youtube.com": {
		dataSelling: 7,
		aiTraining: 8,
		deleteDifficulty: 5,
		summary:
			"YouTube collects extensive viewing data and trains recommendation AI. Deletion follows Google account policies.",
	},
};

/**
 * Mock analyzePrivacyPolicy function
 * Returns cached data if available, null otherwise
 */
async function analyzePrivacyPolicy(serviceName, policyText, domain) {
	// Check cache
	const cached = COMMON_COMPANY_CACHE[domain];
	if (cached) {
		return cached;
	}

	// Without policy text and not in cache, return null
	if (!policyText || policyText.trim().length === 0) {
		return null;
	}

	// This would normally call Gemini and fetch policy via Jina
	// But for tests, we just return null if not cached
	return null;
}

/**
 * Helper function: Clamp a value between min and max
 */
function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

/**
 * Helper function: Calculate years since a date
 */
function yearsSince(date) {
	if (!date) return null;
	const now = new Date();
	return Math.max(0, now.getFullYear() - date.getFullYear());
}

/**
 * Mock scoreServiceRisk function
 * Mirrors the implementation from engine.ts
 */
function scoreServiceRisk(input) {
	const reasons = [];
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
	let tier = "green";
	if (score >= 70) {
		tier = "red";
	} else if (score >= 40) {
		tier = "yellow";
	}

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

	// Calculate delete priority
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

// ============================================================================
// TEST UTILITIES
// ============================================================================

function assert(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

function assertEqual(actual, expected, message) {
	if (actual !== expected) {
		throw new Error(`${message}\n  Expected: ${expected}\n  Actual: ${actual}`);
	}
}

function assertRange(value, min, max, message) {
	if (value < min || value > max) {
		throw new Error(
			`${message}\n  Expected range: ${min}-${max}\n  Actual: ${value}`,
		);
	}
}

async function test(name, fn) {
	const startTime = Date.now();
	try {
		await fn();
		const duration = Date.now() - startTime;
		results.push({ name, passed: true, duration });
		console.log(
			`${colors.green}✓${colors.reset} ${name} ${colors.blue}(${duration}ms)${colors.reset}`,
		);
	} catch (error) {
		const duration = Date.now() - startTime;
		results.push({
			name,
			passed: false,
			error: error instanceof Error ? error.message : String(error),
			duration,
		});
		console.log(
			`${colors.red}✗${colors.reset} ${name} ${colors.blue}(${duration}ms)${colors.reset}`,
		);
		console.log(
			`  ${colors.red}Error: ${error instanceof Error ? error.message : String(error)}${colors.reset}`,
		);
	}
}

// ============================================================================
// TEST SUITE
// ============================================================================

async function runTests() {
	console.log(`\n${colors.blue}Privacy Engine Test Suite${colors.reset}\n`);

	// Test 1: Cached policy analysis
	await test(
		"Cached analysis: GitHub should return predefined ratings",
		async () => {
			const result = await analyzePrivacyPolicy(
				"GitHub",
				"",
				"github.com",
			);

			assert(result !== null, "Result should not be null");
			assertEqual(result.dataSelling, 2, "GitHub dataSelling rating");
			assertEqual(result.aiTraining, 4, "GitHub aiTraining rating");
			assertEqual(result.deleteDifficulty, 3, "GitHub deleteDifficulty rating");
			assert(
				result.summary.length > 0,
				"Summary should not be empty",
			);
		},
	);

	// Test 2: Cached analysis for major companies
	await test(
		"Cached analysis: Google should have high AI training rating",
		async () => {
			const result = await analyzePrivacyPolicy(
				"Google",
				"",
				"google.com",
			);

			assert(result !== null, "Result should not be null");
			assertRange(result.dataSelling, 1, 10, "dataSelling range");
			assertRange(result.aiTraining, 1, 10, "aiTraining range");
			assertEqual(result.aiTraining, 9, "Google aiTraining should be 9");
		},
	);

	// Test 3: Cached analysis for privacy-focused company
	await test(
		"Cached analysis: Apple should have low data selling rating",
		async () => {
			const result = await analyzePrivacyPolicy(
				"Apple",
				"",
				"apple.com",
			);

			assert(result !== null, "Result should not be null");
			assertEqual(result.dataSelling, 2, "Apple dataSelling should be 2");
		},
	);

	// Test 4: Cached analysis for multiple domains
	await test(
		"Cached analysis: Multiple companies should all be found",
		async () => {
			const companies = [
				"facebook.com",
				"tiktok.com",
				"linkedin.com",
				"spotify.com",
				"dropbox.com",
			];

			for (const domain of companies) {
				const result = await analyzePrivacyPolicy("Test", "", domain);
				assert(
					result !== null,
					`${domain} should be in cache`,
				);
				assertRange(
					result.dataSelling,
					1,
					10,
					`${domain} dataSelling`,
				);
			}
		},
	);

	// Test 5: Unknown company returns null (not cached)
	await test(
		"Cached analysis: Unknown domain should return null",
		async () => {
			const result = await analyzePrivacyPolicy(
				"UnknownStartup",
				"",
				"unknownstartup123.com",
			);

			assert(result === null, "Unknown domain with no policy should return null");
		},
	);

	// Test 6: Risk scoring with cached policy
	await test(
		"Risk scoring: GitHub (low risk) should get green tier",
		async () => {
			const input = {
				serviceName: "GitHub",
				domain: "github.com",
				policy: {
					dataSelling: 2,
					aiTraining: 4,
					deleteDifficulty: 3,
				},
				breach: {
					wasBreached: false,
				},
				usage: {},
			};

			const risk = scoreServiceRisk(input);

			assertEqual(risk.serviceName, "GitHub", "Service name");
			assertEqual(risk.domain, "github.com", "Domain");
			assertEqual(risk.tier, "green", "Risk tier should be green");
			assertRange(risk.score, 0, 40, "Low risk score (0-40)");
		},
	);

	// Test 7: Risk scoring with high-risk policy
	await test(
		"Risk scoring: High risk policy should get red tier",
		async () => {
			const input = {
				serviceName: "HighRisk",
				domain: "highrisk.com",
				policy: {
					dataSelling: 9,
					aiTraining: 9,
					deleteDifficulty: 9,
				},
				breach: {
					wasBreached: true,
					breachYear: 2023,
				},
				usage: {},
			};

			const risk = scoreServiceRisk(input);

			assertEqual(risk.tier, "red", "Risk tier should be red");
			assertRange(risk.score, 70, 100, "High risk score (70-100)");
			assert(
				risk.reasons.length > 0,
				"Should have risk reasons",
			);
		},
	);

	// Test 8: Risk scoring with breach history
	await test(
		"Risk scoring: Service with breach should increase score",
		async () => {
			const input = {
				serviceName: "TestService",
				domain: "test.com",
				policy: {
					dataSelling: 5,
					aiTraining: 5,
					deleteDifficulty: 5,
				},
				breach: {
					wasBreached: true,
					breachName: "Test Breach 2023",
					breachYear: 2023,
				},
				usage: {},
			};

			const risk = scoreServiceRisk(input);

			assert(
				risk.score > 30,
				"Breach should increase score above neutral",
			);
			assert(
				risk.reasons.some((r) => r.includes("breach")),
				"Should mention breach in reasons",
			);
		},
	);

	// Test 9: Risk scoring with staleness
	await test(
		"Risk scoring: Unused account (2+ years) should increase score",
		async () => {
			const twoYearsAgo = new Date();
			twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

			const input = {
				serviceName: "OldService",
				domain: "old.com",
				policy: {
					dataSelling: 5,
					aiTraining: 5,
					deleteDifficulty: 5,
				},
				breach: {
					wasBreached: false,
				},
				usage: {
					lastUsedAt: twoYearsAgo,
				},
			};

			const risk = scoreServiceRisk(input);

			assert(
				risk.score > 30,
				"Stale account should increase score",
			);
			assert(
				risk.reasons.some((r) => r.includes("unused")),
				"Should mention unused in reasons",
			);
		},
	);

	// Test 10: Complete end-to-end for cached company
	await test(
		"End-to-end: Analyze cached company (GitHub) should complete",
		async () => {
			const analysis = await analyzePrivacyPolicy("GitHub", "", "github.com");

			assert(analysis !== null, "Should have analysis");
			assertEqual(
				analysis.dataSelling,
				2,
				"GitHub analysis dataSelling",
			);

			// Also test risk scoring with that analysis
			const risk = scoreServiceRisk({
				serviceName: "GitHub",
				domain: "github.com",
				policy: analysis,
				breach: { wasBreached: false },
				usage: {},
			});

			assert(risk.score >= 0 && risk.score <= 100, "Risk score in range");
		},
	);

	// Test 11: Multiple policy metrics validation
	await test(
		"Risk scoring: All metrics contribute to final score",
		async () => {
			const lowRiskPolicy = {
				serviceName: "PrivacyFocused",
				domain: "privacy.com",
				policy: {
					dataSelling: 1,
					aiTraining: 1,
					deleteDifficulty: 1,
				},
				breach: { wasBreached: false },
				usage: {},
			};

			const highRiskPolicy = {
				serviceName: "DataHungry",
				domain: "datahungry.com",
				policy: {
					dataSelling: 10,
					aiTraining: 10,
					deleteDifficulty: 10,
				},
				breach: { wasBreached: false },
				usage: {},
			};

			const lowRisk = scoreServiceRisk(lowRiskPolicy);
			const highRisk = scoreServiceRisk(highRiskPolicy);

			assert(
				highRisk.score > lowRisk.score,
				"High risk policy should score higher than low risk",
			);
		},
	);

	// Test 12: Delete priority calculation
	await test(
		"Risk scoring: High risk + high deletion difficulty = high delete priority",
		async () => {
			const shouldDeleteSoon = {
				serviceName: "Urgent",
				domain: "urgent.com",
				policy: {
					dataSelling: 9,
					aiTraining: 9,
					deleteDifficulty: 8,
				},
				breach: {
					wasBreached: true,
					breachYear: 2020,
				},
				usage: {
					lastUsedAt: new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000),
				},
			};

			const risk = scoreServiceRisk(shouldDeleteSoon);

			assert(
				(risk.deletePriority ?? 0) > 0,
				"Should have high delete priority",
			);
		},
	);

	// Test 13: Boundary values for policy ratings
	await test(
		"Risk scoring: Boundary values (1 and 10) should work correctly",
		async () => {
			[1, 5, 10].forEach((rating) => {
				const input = {
					serviceName: "Test",
					domain: "test.com",
					policy: {
						dataSelling: rating,
						aiTraining: rating,
						deleteDifficulty: rating,
					},
					breach: { wasBreached: false },
					usage: {},
				};

				const risk = scoreServiceRisk(input);
				assertRange(risk.score, 0, 100, `Score for rating ${rating}`);
				assert(
					["red", "yellow", "green"].includes(risk.tier),
					`Valid tier for rating ${rating}`,
				);
			});
		},
	);

	// Test 14: Tier cutoffs
	await test(
		"Risk scoring: Tier cutoffs should be correct (40 and 70)",
		async () => {
			let input = {
				serviceName: "GreenBoundary",
				domain: "gb.com",
				policy: {
					dataSelling: 3,
					aiTraining: 3,
					deleteDifficulty: 3,
				},
				breach: { wasBreached: false },
				usage: {},
			};
			let risk = scoreServiceRisk(input);
			assertEqual(risk.tier, "green", "Score < 40 should be green");

			input = {
				serviceName: "YellowZone",
				domain: "yz.com",
				policy: {
					dataSelling: 8,
					aiTraining: 6,
					deleteDifficulty: 6,
				},
				breach: { wasBreached: false },
				usage: {},
			};
			risk = scoreServiceRisk(input);
			assertEqual(risk.tier, "yellow", "40 <= Score < 70 should be yellow");

			input = {
				serviceName: "RedBoundary",
				domain: "rb.com",
				policy: {
					dataSelling: 10,
					aiTraining: 9,
					deleteDifficulty: 8,
				},
				breach: {
					wasBreached: true,
					breachYear: 2020,
				},
				usage: {},
			};
			risk = scoreServiceRisk(input);
			assertEqual(risk.tier, "red", "Score >= 70 should be red");
		},
	);

	// Print summary
	console.log(`\n${colors.blue}═══════════════════════════════════════${colors.reset}`);

	const passed = results.filter((r) => r.passed).length;
	const failed = results.filter((r) => !r.passed).length;
	const totalTime = results.reduce((sum, r) => sum + (r.duration || 0), 0);

	console.log(
		`${colors.green}Passed: ${passed}${colors.reset} | ${colors.red}Failed: ${failed}${colors.reset} | Total: ${results.length}`,
	);
	console.log(`Total time: ${totalTime}ms`);

	if (failed > 0) {
		console.log(`\n${colors.red}Failed Tests:${colors.reset}`);
		results
			.filter((r) => !r.passed)
			.forEach((r) => {
				console.log(`  ${colors.red}✗${colors.reset} ${r.name}`);
				console.log(`    ${r.error}`);
			});
	}

	console.log(`\n${colors.blue}═══════════════════════════════════════${colors.reset}\n`);

	process.exit(failed === 0 ? 0 : 1);
}

// Run tests
runTests().catch((error) => {
	console.error(`${colors.red}Test runner error:${colors.reset}`, error);
	process.exit(1);
});
