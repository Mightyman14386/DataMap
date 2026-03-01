const scenarios = [
  { messages: 500, pages: 5 },
  { messages: 2000, pages: 20 },
  { messages: 10000, pages: 100 },
];

const old = {
  listSleepMsPerPage: 500,
  getChunkSize: 20,
  getSleepMsBetweenChunks: 1000,
  estimatedGetRttMs: 220,
  estimatedListRttMs: 180,
  parserMsPerMessage: 0.00086,
};

const optimized = {
  listSleepMsPerPage: 0,
  concurrency: 15,
  estimatedGetRttMs: 90,
  estimatedListRttMs: 140,
  parserMsPerMessage: 0.00095,
};

function estimateOld({ messages, pages }) {
  const listTime = pages * old.estimatedListRttMs + Math.max(0, pages - 1) * old.listSleepMsPerPage;
  const chunks = Math.ceil(messages / old.getChunkSize);
  const getTime = chunks * old.estimatedGetRttMs + Math.max(0, chunks - 1) * old.getSleepMsBetweenChunks;
  const parseTime = messages * old.parserMsPerMessage;
  return listTime + getTime + parseTime;
}

function estimateOptimized({ messages, pages }) {
  const listTime = pages * optimized.estimatedListRttMs + Math.max(0, pages - 1) * optimized.listSleepMsPerPage;
  const waves = Math.ceil(messages / optimized.concurrency);
  const getTime = waves * optimized.estimatedGetRttMs;
  const parseTime = messages * optimized.parserMsPerMessage;
  return listTime + getTime + parseTime;
}

const rows = scenarios.map((scenario) => {
  const oldMs = estimateOld(scenario);
  const newMs = estimateOptimized(scenario);
  return {
    messages: scenario.messages,
    oldSec: (oldMs / 1000).toFixed(2),
    optimizedSec: (newMs / 1000).toFixed(2),
    speedup: (oldMs / newMs).toFixed(2) + "x",
    improvement: (((oldMs - newMs) / oldMs) * 100).toFixed(1) + "%",
  };
});

console.log("Estimated end-to-end runtime impact (network + pacing + parse):");
console.table(rows);
