/**
 * LLM Batch Analysis Test Suite
 * Tests the Gemini and OpenAI batch analysis functions with mocked API responses
 * 
 * To run with REAL API keys:
 * export GEMINI_API_KEY="your-key"
 * export OPENAI_API_KEY="your-key"
 * node scripts/test-llm-batch-analysis.mjs
 * 
 * Run without API keys (mock mode):
 * npm run test:llm-batch
 */

const colors = {
	reset: "\x1b[0m",
	green: "\x1b[32m",
	red: "\x1b[31m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	gray: "\x1b[90m",
};

const results = [];

// ============================================================================
// MOCK API RESPONSES
// ============================================================================

/**
 * Mock Gemini API response
 */
function getMockGeminiResponse() {
	return {
		candidates: [
			{
				content: {
					parts: [
						{
							text: `Here's the analysis:

[
  {
    "domain": "example1.com",
    "dataSelling": 7,
    "aiTraining": 8,
    "deleteDifficulty": 5,
    "summary": "Company collects extensive user data for ad targeting. Uses for AI model training."
  },
  {
    "domain": "example2.com",
    "dataSelling": 3,
    "aiTraining": 2,
    "deleteDifficulty": 3,
    "summary": "Privacy-focused company with minimal data collection and AI use."
  }
]`,
						},
					],
				},
			},
		],
	};
}

/**
 * Mock OpenAI API response
 */
function getMockOpenAIResponse() {
	return {
		choices: [
			{
				message: {
					content: `Analysis complete. Here's the JSON response:

[
  {
    "domain": "example3.com",
    "dataSelling": 6,
    "aiTraining": 5,
    "deleteDifficulty": 4,
    "summary": "Moderate data collection with selective AI training use."
  },
  {
    "domain": "example4.com",
    "dataSelling": 9,
    "aiTraining": 9,
    "deleteDifficulty": 8,
    "summary": "Aggressive data collection and AI training. Difficult account deletion."
  }
]`,
				},
			},
		],
	};
}

// ============================================================================
// REAL API CLIENT (uses actual keys if available)
// ============================================================================

async function callGeminiAPI(prompt, apiKey) {
	if (!apiKey) {
		console.log(`    ${colors.gray}[MOCK] No GEMINI_API_KEY, using mock response${colors.reset}`);
		return getMockGeminiResponse();
	}

	try {
		const response = await fetch(
			`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					contents: [{ parts: [{ text: prompt }] }],
					generationConfig: {
						temperature: 0.2,
						maxOutputTokens: 2000,
					},
				}),
			},
		);

		if (!response.ok) {
			throw new Error(`API returned ${response.status}`);
		}

		return await response.json();
	} catch (error) {
		console.error(`    ${colors.red}Gemini API error: ${error.message}${colors.reset}`);
		throw error;
	}
}

async function callOpenAIAPI(prompt, apiKey) {
	if (!apiKey) {
		console.log(`    ${colors.gray}[MOCK] No OPENAI_API_KEY, using mock response${colors.reset}`);
		return getMockOpenAIResponse();
	}

	try {
		const response = await fetch("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				model: "gpt-4-turbo",
				messages: [
					{
						role: "system",
						content: "You are a privacy policy analyst. Respond with ONLY valid JSON.",
					},
					{
						role: "user",
						content: prompt,
					},
				],
				temperature: 0.2,
				max_tokens: 2000,
			}),
		});

		if (!response.ok) {
			throw new Error(`API returned ${response.status}`);
		}

		return await response.json();
	} catch (error) {
		console.error(`    ${colors.red}OpenAI API error: ${error.message}${colors.reset}`);
		throw error;
	}
}

// ============================================================================
// BATCH ANALYSIS IMPLEMENTATION (mirrors analysis-service.ts)
// ============================================================================

let lastGeminiRequestTime = 0;
let lastOpenAIRequestTime = 0;

async function waitForRateLimit(provider) {
	let lastTime = 0;
	let limit = 0;

	if (provider === "gemini") {
		lastTime = lastGeminiRequestTime;
		limit = 3000; // 20 requests/minute
	} else if (provider === "openai") {
		lastTime = lastOpenAIRequestTime;
		limit = 2000; // Reasonable throttle
	}

	const elapsed = Date.now() - lastTime;
	if (elapsed < limit) {
		const waitMs = limit - elapsed;
		console.log(`    ${colors.gray}Rate limiting: Waiting ${waitMs}ms${colors.reset}`);
		await new Promise((resolve) => setTimeout(resolve, waitMs));
	}

	if (provider === "gemini") {
		lastGeminiRequestTime = Date.now();
	} else if (provider === "openai") {
		lastOpenAIRequestTime = Date.now();
	}
}

async function batchAnalyzeWithGemini(policies, apiKey) {
	const policiesText = policies
		.map(
			(p, i) => `
POLICY ${i + 1}: ${p.serviceName} (${p.domain})
${p.policyText.substring(0, 2000)}
---`,
		)
		.join("\n");

	const prompt = `You are a privacy policy analyst specializing in data privacy risks. Analyze the following privacy policies.

For EACH policy, rate on a scale of 1-10:
1. **Data Selling Risk**: Does the company sell, share, or license user data to third parties? (1=never, 10=actively monetizes all data)
2. **AI Training Risk**: Does the company use user data to train AI/ML models? (1=never, 10=heavily uses for AI training)
3. **Deletion Difficulty**: How hard/long is it to delete your account? (1=very easy/instant, 10=nearly impossible/prolonged retention)

Respond with ONLY valid JSON array (one object per policy analyzed, matching the input order):
[
  {
    "domain": "example1.com",
    "dataSelling": <number 1-10>,
    "aiTraining": <number 1-10>,
    "deleteDifficulty": <number 1-10>,
    "summary": "<2-sentence summary>"
  },
  ...
]

Policies to analyze:
${policiesText}`;

	const data = await callGeminiAPI(prompt, apiKey);
	const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

	if (!content) {
		return null;
	}

	const jsonMatch = content.match(/\[[\s\S]*\]/);
	if (!jsonMatch) {
		return null;
	}

	const parsed = JSON.parse(jsonMatch[0]);
	const result = {};

	for (const item of parsed) {
		if (item && item.domain) {
			result[item.domain] = {
				dataSelling: Math.max(1, Math.min(10, parseInt(item.dataSelling) || 5)),
				aiTraining: Math.max(1, Math.min(10, parseInt(item.aiTraining) || 5)),
				deleteDifficulty: Math.max(
					1,
					Math.min(10, parseInt(item.deleteDifficulty) || 5),
				),
				summary: item.summary || "Privacy analysis based on policy review.",
			};
		}
	}

	return result;
}

async function batchAnalyzeWithOpenAI(policies, apiKey) {
	const policiesText = policies
		.map(
			(p, i) => `
POLICY ${i + 1}: ${p.serviceName} (${p.domain})
${p.policyText.substring(0, 2000)}
---`,
		)
		.join("\n");

	const prompt = `Analyze these privacy policies and rate for: data selling (1-10), AI training (1-10), deletion difficulty (1-10). Return JSON array with 'domain', 'dataSelling', 'aiTraining', 'deleteDifficulty', and 'summary' for each:\n\n${policiesText}`;

	const data = await callOpenAIAPI(prompt, apiKey);
	const content = data.choices?.[0]?.message?.content;

	if (!content) {
		return null;
	}

	const jsonMatch = content.match(/\[[\s\S]*\]/);
	if (!jsonMatch) {
		return null;
	}

	const parsed = JSON.parse(jsonMatch[0]);
	const result = {};

	if (Array.isArray(parsed)) {
		for (const item of parsed) {
			if (item && item.domain) {
				result[item.domain] = {
					dataSelling: Math.max(1, Math.min(10, parseInt(item.dataSelling) || 5)),
					aiTraining: Math.max(1, Math.min(10, parseInt(item.aiTraining) || 5)),
					deleteDifficulty: Math.max(
						1,
						Math.min(10, parseInt(item.deleteDifficulty) || 5),
					),
					summary: item.summary || "Privacy analysis based on policy review.",
				};
			}
		}
	}

	return result;
}

// ============================================================================
// TEST UTILITIES
// ============================================================================

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
		console.log(`  ${colors.red}Error: ${error.message}${colors.reset}`);
	}
}

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
	if (actual !== expected)
		throw new Error(`${message}\n  Expected: ${expected}\n  Actual: ${actual}`);
}

// ============================================================================
// TEST SUITE
// ============================================================================

async function runTests() {
	const geminKey = process.env.GEMINI_API_KEY;
	const openaiKey = process.env.OPENAI_API_KEY;

	console.log(`\n${colors.blue}LLM Batch Analysis Test Suite${colors.reset}\n`);

	if (!geminKey && !openaiKey) {
		console.log(`${colors.yellow}⚠ No API keys found!${colors.reset}`);
		console.log(`${colors.gray}Set GEMINI_API_KEY and/or OPENAI_API_KEY to test with real APIs${colors.reset}\n`);
	} else {
		if (geminKey) console.log(`${colors.green}✓${colors.reset} GEMINI_API_KEY configured`);
		if (openaiKey) console.log(`${colors.green}✓${colors.reset} OPENAI_API_KEY configured\n`);
	}

	// Sample policies for testing
	const testPolicies = [
		{
			serviceName: "Example Corp 1",
			domain: "example1.com",
			policyText: `Privacy Policy: We collect user data for personalization and advertising. 
We may share data with third-party partners. We use machine learning to train AI models on user behavior.
Account deletion requires email verification and a 30-day waiting period.`,
		},
		{
			serviceName: "Example Corp 2",
			domain: "example2.com",
			policyText: `Privacy Policy: We respect user privacy. We do not sell user data. 
All data is encrypted and kept secure. Users can delete their account immediately with one click.
We do not use AI training on personal data.`,
		},
	];

	// Test 1: Gemini batch analysis (with mocking)
	await test(
		"Gemini batch analysis: Should parse JSON response correctly",
		async () => {
			console.log(`    ${colors.gray}Testing with ${testPolicies.length} policies${colors.reset}`);
			await waitForRateLimit("gemini");
			const result = await batchAnalyzeWithGemini(testPolicies, geminKey);

			assert(result !== null, "Result should not be null");
			assert(typeof result === "object", "Result should be an object");

			for (const policy of testPolicies) {
				const analysis = result[policy.domain];
				assert(analysis !== undefined, `Should have analysis for ${policy.domain}`);
				assert(analysis.dataSelling >= 1 && analysis.dataSelling <= 10, "dataSelling in range");
				assert(analysis.aiTraining >= 1 && analysis.aiTraining <= 10, "aiTraining in range");
				assert(analysis.deleteDifficulty >= 1 && analysis.deleteDifficulty <= 10, "deleteDifficulty in range");
				assert(analysis.summary.length > 0, "Summary should not be empty");
			}
		},
	);

	// Test 2: OpenAI batch analysis (with mocking)
	await test(
		"OpenAI batch analysis: Should parse JSON response correctly",
		async () => {
			console.log(`    ${colors.gray}Testing with ${testPolicies.length} policies${colors.reset}`);
			await waitForRateLimit("openai");
			const result = await batchAnalyzeWithOpenAI(testPolicies, openaiKey);

			assert(result !== null, "Result should not be null");
			assert(typeof result === "object", "Result should be an object");

			for (const policy of testPolicies) {
				const analysis = result[policy.domain];
				assert(analysis !== undefined, `Should have analysis for ${policy.domain}`);
				assert(analysis.dataSelling >= 1 && analysis.dataSelling <= 10, "dataSelling in range");
				assert(analysis.aiTraining >= 1 && analysis.aiTraining <= 10, "aiTraining in range");
				assert(analysis.deleteDifficulty >= 1 && analysis.deleteDifficulty <= 10, "deleteDifficulty in range");
				assert(analysis.summary.length > 0, "Summary should not be empty");
			}
		},
	);

	// Test 3: Rate limiting works
	await test(
		"Rate limiting: Should enforce spacing between requests",
		async () => {
			const start = Date.now();
			await waitForRateLimit("gemini");
			const geminiTime = Date.now() - start;
			
			const start2 = Date.now();
			await waitForRateLimit("gemini");
			const geminiTime2 = Date.now() - start2;
			
			assert(
				geminiTime2 >= 2500,
				`Should wait at least 2.5s, waited ${geminiTime2}ms`,
			);
		},
	);

	// Test 4: Batch analysis preserves domain mapping
	await test(
		"Batch analysis: Domain keys should match input domains",
		async () => {
			await waitForRateLimit("gemini");
			const result = await batchAnalyzeWithGemini(testPolicies, geminKey);

			const domains = Object.keys(result);
			const expectedDomains = testPolicies.map((p) => p.domain);

			for (const expected of expectedDomains) {
				assert(domains.includes(expected), `Should include ${expected}`);
			}
		},
	);

	// Test 5: Empty policy list
	await test(
		"Batch analysis: Empty policy list should return empty object",
		async () => {
			const result = await batchAnalyzeWithGemini([], geminKey);
			assert(Object.keys(result || {}).length === 0, "Should return empty result for empty input");
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

	if (geminKey || openaiKey) {
		console.log(`${colors.blue}How to get API keys:${colors.reset}`);
		if (!geminKey) {
			console.log(`  ${colors.yellow}Gemini:${colors.reset} https://aistudio.google.com/app/apikey`);
		}
		if (!openaiKey) {
			console.log(`  ${colors.yellow}OpenAI:${colors.reset} https://platform.openai.com/api-keys`);
		}
		console.log();
	}

	process.exit(failed === 0 ? 0 : 1);
}

// Run tests
runTests().catch((error) => {
	console.error(`${colors.red}Test runner error:${colors.reset}`, error);
	process.exit(1);
});
