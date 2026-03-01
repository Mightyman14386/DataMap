import { performance } from "node:perf_hooks";

const MESSAGE_COUNT = 100000;
const ROUNDS = 7;

const relevantKeywords = [
  "welcome", "verify", "confirm", "account", "registration", "signup",
  "activate", "reset", "password", "subscription", "trial", "premium",
  "confirm email", "validate", "authorization", "action required",
];

function isRelevant(subject, snippet) {
  const subjectLower = subject.toLowerCase();
  const snippetLower = snippet.toLowerCase();
  return relevantKeywords.some(k => subjectLower.includes(k) || snippetLower.includes(k));
}

function extractRelevantHeaders(headers = []) {
  let subject = "";
  let from = "";
  let date;

  for (const header of headers) {
    if (!header.name || !header.value) continue;
    const normalized = header.name.toLowerCase();
    if (normalized === "subject") subject = header.value;
    if (normalized === "from") from = header.value;
    if (normalized === "date") date = header.value;
  }

  return { subject, from, date };
}

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

function buildMessages(count) {
  const subjects = [
    "Welcome to ExampleApp",
    "Receipt for your order",
    "Verify your account now",
    "Password reset requested",
    "Your monthly newsletter",
    "Action required for login",
  ];

  const snippets = [
    "Please confirm your email to continue",
    "No action needed right now",
    "Account activity detected",
    "Here is your invoice",
    "Trial ending soon",
    "System update",
  ];

  return Array.from({ length: count }, (_, i) => ({
    payload: {
      headers: [
        { name: "X-Trace", value: `trace-${i}` },
        { name: "From", value: `sender${i}@example.com` },
        { name: "X-Mailer", value: "mailer" },
        { name: "Subject", value: subjects[randomInt(subjects.length)] },
        { name: "Date", value: new Date(1700000000000 + i * 1000).toUTCString() },
        { name: "List-Unsubscribe", value: "<mailto:unsubscribe@example.com>" },
      ],
    },
    snippet: snippets[randomInt(snippets.length)],
  }));
}

function parseOld(messages) {
  const parsed = [];
  for (const message of messages) {
    const headers = message.payload?.headers ?? [];
    const subject = headers.find(h => h.name === "Subject")?.value ?? "";
    const from = headers.find(h => h.name === "From")?.value ?? "";
    const snippet = message.snippet ?? "";
    const dateValue = headers.find(h => h.name === "Date")?.value;

    if (isRelevant(subject, snippet)) {
      parsed.push({ subject, from, ...(dateValue && { date: dateValue }) });
    }
  }
  return parsed;
}

function parseNew(messages) {
  const parsed = [];
  for (const message of messages) {
    const { subject, from, date } = extractRelevantHeaders(message.payload?.headers ?? []);
    const snippet = message.snippet ?? "";

    if (isRelevant(subject, snippet)) {
      parsed.push({ subject, from, ...(date && { date }) });
    }
  }
  return parsed;
}

function runBenchmark(name, fn, input, rounds = ROUNDS) {
  const times = [];
  let out = null;

  for (let i = 0; i < rounds; i += 1) {
    const start = performance.now();
    out = fn(input);
    const end = performance.now();
    times.push(end - start);
  }

  const avg = times.reduce((sum, t) => sum + t, 0) / times.length;
  return { name, avg, min: Math.min(...times), max: Math.max(...times), parsedCount: out?.length ?? 0 };
}

const messages = buildMessages(MESSAGE_COUNT);
console.log(`Benchmark dataset: ${MESSAGE_COUNT.toLocaleString()} mock Gmail messages`);

const oldResult = runBenchmark("old-parser", parseOld, messages);
const newResult = runBenchmark("new-parser", parseNew, messages);

const speedup = oldResult.avg / newResult.avg;
const improvementPct = ((oldResult.avg - newResult.avg) / oldResult.avg) * 100;

console.log("\nResults (ms):");
console.table([
  { parser: oldResult.name, avgMs: oldResult.avg.toFixed(2), minMs: oldResult.min.toFixed(2), maxMs: oldResult.max.toFixed(2), parsedCount: oldResult.parsedCount },
  { parser: newResult.name, avgMs: newResult.avg.toFixed(2), minMs: newResult.min.toFixed(2), maxMs: newResult.max.toFixed(2), parsedCount: newResult.parsedCount },
]);

console.log(`Speedup: ${speedup.toFixed(2)}x (${improvementPct.toFixed(1)}% faster avg)`);
