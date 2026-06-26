// generate-corpus.mjs — deterministic synthetic memory corpus + probe queries.
// Seeded so CI runs are reproducible; no real data, no network.

// mulberry32 PRNG — deterministic from a 32-bit seed.
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SUBJECTS = ["service", "module", "pipeline", "worker", "scheduler", "cache", "gateway", "indexer", "collector", "planner", "validator", "router", "broker", "ledger", "sentinel"];
const ADJ = ["northbound", "primary", "shadow", "canary", "legacy", "regional", "ephemeral", "bonded", "tiered", "federated", "idempotent", "bitemporal", "sharded", "warm", "cold"];
const ATTRS = ["retry budget", "timeout", "owner", "region", "replica count", "rollout phase", "alert threshold", "backoff cap", "queue depth", "ttl", "batch size", "fanout limit"];
const VALUES = ["seven", "two hundred", "eu-west", "three", "phase two", "ninety percent", "ten seconds", "sixty four", "single digit", "twenty four hours", "off-peak", "twelve"];

const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

// Build N fact records. Realistic confusability: each entity owns SEVERAL
// attributes (so the same entity name recurs across many facts), and entity
// names reuse a small stem pool — so retrieval must discriminate by attribute,
// not just entity, and gets harder as the store grows. Each (entity, attr) pair
// is unique. A probe targets one specific (entity, attr).
export function generateCorpus(n, seed = 1, attrsPerEntity = 6) {
  const r = rng(seed);
  const entityCount = Math.max(1, Math.ceil(n / attrsPerEntity));
  const entities = [];
  const usedNames = new Set();
  let g = 0;
  while (entities.length < entityCount) {
    // small stem pool (ADJ x SUBJECTS = 225 combos) + index → deliberate stem reuse
    const name = `${pick(r, ADJ)}-${pick(r, SUBJECTS)}-${g % 50}`;
    g++;
    if (usedNames.has(name)) continue;
    usedNames.add(name);
    entities.push(name);
  }
  const facts = [];
  const seen = new Set();
  let i = 0;
  while (facts.length < n) {
    const entity = entities[i % entityCount];
    const attr = ATTRS[Math.floor(i / entityCount) % ATTRS.length];
    const key = entity + "|" + attr;
    i++;
    if (seen.has(key)) continue;
    if (i > n * ATTRS.length + entityCount) break; // safety
    seen.add(key);
    const value = pick(r, VALUES);
    facts.push({ id: facts.length, entity, attr, value, text: `The ${entity} ${attr} is ${value}.` });
  }
  return facts;
}

// Build P probes, each targeting a known fact, phrased differently from the fact
// text so retrieval is non-trivial (question form, no value leakage).
export function generateProbes(facts, p, seed = 99) {
  const r = rng(seed);
  const probes = [];
  const used = new Set();
  while (probes.length < p && used.size < facts.length) {
    const idx = Math.floor(r() * facts.length);
    if (used.has(idx)) continue;
    used.add(idx);
    const f = facts[idx];
    probes.push({ targetId: f.id, query: `What is the ${f.attr} of the ${f.entity}?` });
  }
  return probes;
}
