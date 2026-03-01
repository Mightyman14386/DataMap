/**
 * Test script for sample JSON payloads
 * Validates that sample JSON files are valid for API calls
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function validate(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

async function testSamples() {
	console.log("Validating sample JSON files...\n");

	// Test 1: Single risk score sample
	console.log("1. Testing risk-score-sample.json...");
	try {
		const samplePath = join(__dirname, "risk-score-sample.json");
		const sampleContent = readFileSync(samplePath, "utf-8");
		const sample = JSON.parse(sampleContent);

		validate(sample.serviceName, "serviceName is required");
		validate(sample.domain, "domain is required");
		validate(sample.policy, "policy object is required");
		validate(typeof sample.policy.dataSelling === "number", "policy.dataSelling must be a number");
		validate(sample.policy.dataSelling >= 1 && sample.policy.dataSelling <= 10, "policy.dataSelling must be 1-10");
		validate(typeof sample.policy.aiTraining === "number", "policy.aiTraining must be a number");
		validate(sample.policy.aiTraining >= 1 && sample.policy.aiTraining <= 10, "policy.aiTraining must be 1-10");
		validate(typeof sample.policy.deleteDifficulty === "number", "policy.deleteDifficulty must be a number");
		validate(sample.policy.deleteDifficulty >= 1 && sample.policy.deleteDifficulty <= 10, "policy.deleteDifficulty must be 1-10");
		validate(sample.breach, "breach object is required");
		validate(typeof sample.breach.wasBreached === "boolean", "breach.wasBreached must be boolean");
		validate(sample.usage, "usage object is required");

		console.log("   ✓ File is valid");
		console.log(`   ✓ Service: ${sample.serviceName} (${sample.domain})`);
		console.log(`   ✓ Policy Scores - Data Selling: ${sample.policy.dataSelling}, AI Training: ${sample.policy.aiTraining}, Delete Difficulty: ${sample.policy.deleteDifficulty}`);
		console.log(`   ✓ Breach: ${sample.breach.wasBreached ? 'YES' : 'NO'}`);
		if (sample.persist !== undefined) {
			console.log(`   ✓ Persist: ${sample.persist}`);
		}
	} catch (error) {
		console.error(`   ✗ Error: ${error.message}`);
		process.exit(1);
	}

	// Test 2: Batch risk score sample
	console.log("\n2. Testing risk-score-batch-sample.json...");
	try {
		const batchPath = join(__dirname, "risk-score-batch-sample.json");
		const batchContent = readFileSync(batchPath, "utf-8");
		const batch = JSON.parse(batchContent);

		validate(batch.services, "services array is required");
		validate(Array.isArray(batch.services), "services must be an array");
		validate(batch.services.length > 0, "services array must not be empty");

		for (let i = 0; i < batch.services.length; i++) {
			const service = batch.services[i];
			validate(service.serviceName, `services[${i}].serviceName is required`);
			validate(service.domain, `services[${i}].domain is required`);
			validate(service.policy, `services[${i}].policy is required`);
			validate(typeof service.policy.dataSelling === "number", `services[${i}].policy.dataSelling must be a number`);
			validate(service.policy.dataSelling >= 1 && service.policy.dataSelling <= 10, `services[${i}].policy.dataSelling must be 1-10`);
			validate(typeof service.policy.aiTraining === "number", `services[${i}].policy.aiTraining must be a number`);
			validate(service.policy.aiTraining >= 1 && service.policy.aiTraining <= 10, `services[${i}].policy.aiTraining must be 1-10`);
			validate(typeof service.policy.deleteDifficulty === "number", `services[${i}].policy.deleteDifficulty must be a number`);
			validate(service.policy.deleteDifficulty >= 1 && service.policy.deleteDifficulty <= 10, `services[${i}].policy.deleteDifficulty must be 1-10`);
			validate(service.breach, `services[${i}].breach is required`);
			validate(typeof service.breach.wasBreached === "boolean", `services[${i}].breach.wasBreached must be boolean`);
			validate(service.usage, `services[${i}].usage is required`);
		}

		console.log(`   ✓ File is valid`);
		console.log(`   ✓ Contains ${batch.services.length} services:`);
		for (const service of batch.services) {
			console.log(`     - ${service.serviceName} (${service.domain}) - Scores: ${service.policy.dataSelling}/${service.policy.aiTraining}/${service.policy.deleteDifficulty}`);
		}
		if (batch.persist !== undefined) {
			console.log(`   ✓ Persist: ${batch.persist}`);
		}
	} catch (error) {
		console.error(`   ✗ Error: ${error.message}`);
		process.exit(1);
	}

	console.log("\n✓ All sample files are valid!\n");
}

testSamples().catch(err => {
	console.error("Sample validation error:", err);
	process.exit(1);
});
