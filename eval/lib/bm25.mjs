// bm25.mjs — dependency-free BM25 (Okapi) retriever.
// Used by the effectiveness study to stand in for "retrieve a focused slice"
// without any external service, embedding API, or secret.

export function tokenize(text) {
  return text.toLowerCase().match(/[a-z0-9]+/g) || [];
}

export class BM25 {
  constructor(docs, { k1 = 1.5, b = 0.75 } = {}) {
    this.k1 = k1;
    this.b = b;
    this.docs = docs; // array of { id, text }
    this.termFreqs = []; // per-doc Map(term -> count)
    this.docLen = [];
    const df = new Map();
    let totalLen = 0;
    for (const d of docs) {
      const toks = tokenize(d.text);
      totalLen += toks.length;
      this.docLen.push(toks.length);
      const tf = new Map();
      for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
      this.termFreqs.push(tf);
      for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
    }
    this.avgdl = docs.length ? totalLen / docs.length : 0;
    this.N = docs.length;
    this.idf = new Map();
    for (const [t, n] of df) {
      // BM25 idf with +1 to keep it non-negative.
      this.idf.set(t, Math.log(1 + (this.N - n + 0.5) / (n + 0.5)));
    }
  }

  score(queryTerms, i) {
    const tf = this.termFreqs[i];
    const dl = this.docLen[i];
    let s = 0;
    for (const t of queryTerms) {
      const f = tf.get(t);
      if (!f) continue;
      const idf = this.idf.get(t) || 0;
      s += idf * ((f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * dl) / this.avgdl)));
    }
    return s;
  }

  topK(query, k = 10) {
    const q = tokenize(query);
    const scored = this.docs.map((d, i) => ({ id: d.id, score: this.score(q, i) }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }
}
