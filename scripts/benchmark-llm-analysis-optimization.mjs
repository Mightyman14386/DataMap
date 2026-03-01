import { performance } from "node:perf_hooks";

const POLICY_COUNT = 2000;

function buildPolicies(count) {
  return Array.from({ length: count }, (_, i) => ({
    serviceName: `Service ${i}`,
    domain: `service${i}.example.com`,
    policyText: "Lorem ipsum ".repeat(400),
  }));
}

function oldFindBasedJoin(policies, parsedItems) {
  const out = {};
  for (const item of parsedItems) {
    const matched = policies.find((p) => p.domain === item.domain);
    out[item.domain] = { hasPolicy: Boolean(matched) };
  }
  return out;
}

function newMapBasedJoin(policies, parsedItems) {
  const map = new Map(policies.map((p) => [p.domain, p]));
  const out = {};
  for (const item of parsedItems) {
    out[item.domain] = { hasPolicy: map.has(item.domain) };
  }
  return out;
}

function oldSinglePromptChars(policies) {
  return policies.reduce((sum, p) => sum + p.policyText.substring(0, 2000).length + p.serviceName.length + p.domain.length + 16, 0);
}

function newChunkPromptChars(policies, maxPerChunk = 8, maxItemChars = 1600, maxBatchChars = 9000) {
  let chunks = 0;
  let currentCount = 0;
  let currentChars = 0;

  for (const p of policies) {
    const itemChars = Math.min(p.policyText.length, maxItemChars) + p.serviceName.length + p.domain.length + 32;
    const exceedCount = currentCount >= maxPerChunk;
    const exceedChars = currentChars + itemChars > maxBatchChars;
    if ((exceedCount || exceedChars) && currentCount > 0) {
      chunks += 1;
      currentCount = 0;
      currentChars = 0;
    }
    currentCount += 1;
    currentChars += itemChars;
  }

  if (currentCount > 0) chunks += 1;
  return chunks;
}

function time(fn) {
  const start = performance.now();
  const result = fn();
  return { ms: performance.now() - start, result };
}

const policies = buildPolicies(POLICY_COUNT);
const parsed = policies.map((p) => ({ domain: p.domain }));

const oldJoin = time(() => oldFindBasedJoin(policies, parsed));
const newJoin = time(() => newMapBasedJoin(policies, parsed));
const oldChars = oldSinglePromptChars(policies);
const newChunks = newChunkPromptChars(policies);

console.log(`Dataset: ${POLICY_COUNT.toLocaleString()} policies`);
console.table([
  {
    metric: "join parsed items to policies",
    oldMs: oldJoin.ms.toFixed(2),
    optimizedMs: newJoin.ms.toFixed(2),
    speedup: (oldJoin.ms / newJoin.ms).toFixed(2) + "x",
  },
  {
    metric: "LLM prompt strategy",
    oldMs: "N/A",
    optimizedMs: "N/A",
    speedup: `${newChunks} chunks vs 1 huge batch`,
  },
  {
    metric: "total policy chars sent",
    oldMs: oldChars.toLocaleString(),
    optimizedMs: "bounded per chunk",
    speedup: "lower timeout risk",
  },
]);

console.log(`Old single-batch prompt chars: ${oldChars.toLocaleString()}`);
console.log(`Optimized chunk count: ${newChunks}`);
console.log(`Join speedup: ${(oldJoin.ms / newJoin.ms).toFixed(2)}x`);

