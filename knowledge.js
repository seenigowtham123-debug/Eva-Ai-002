// Knowledge base: chunking + BM25 ranking over .txt/.md/etc files in a folder.
const fs = require("fs");
const path = require("path");

const ALLOWED = /\.(txt|md|markdown|csv|json|log)$/i;
const STOP = new Set("the and for are but not you all can had her was one our out has have this that with from they will what when your about which their there would these those into than then them been were said each how its who did get may".split(" "));

function tokenize(text) {
  return (String(text).toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) || []).filter(
    (w) => (w.length > 2 || /[^\u0000-ɏ]/.test(w)) && !STOP.has(w)
  );
}

// Split into paragraph groups of roughly 300-900 characters.
function chunkText(text, target = 700) {
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let cur = "";
  for (const p of paras) {
    if (cur && cur.length + p.length > target) {
      chunks.push(cur);
      cur = "";
    }
    cur = cur ? cur + "\n\n" + p : p;
    while (cur.length > target * 1.6) {
      chunks.push(cur.slice(0, target));
      cur = cur.slice(target);
    }
  }
  if (cur.trim().length > 15) chunks.push(cur);
  return chunks;
}

function safeName(name) {
  const base = path.basename(String(name || "")).replace(/[^\p{L}\p{N}._ -]/gu, "_").replace(/^\.+/, "").trim();
  return base.slice(0, 120);
}

function createKnowledge(dir) {
  fs.mkdirSync(dir, { recursive: true });
  let cache = { sig: "", chunks: [], df: new Map(), avgLen: 0 };

  const files = () => fs.readdirSync(dir).filter((f) => ALLOWED.test(f));

  function list() {
    return files()
      .map((f) => {
        const st = fs.statSync(path.join(dir, f));
        return { name: f, size: st.size, updatedAt: st.mtime.toISOString() };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function build() {
    const sig = list().map((f) => `${f.name}:${f.size}:${f.updatedAt}`).join("|");
    if (sig === cache.sig) return cache;
    const chunks = [];
    for (const f of files()) {
      const text = fs.readFileSync(path.join(dir, f), "utf8");
      chunkText(text).forEach((t, i) => {
        const tokens = tokenize(t);
        const tf = new Map();
        tokens.forEach((w) => tf.set(w, (tf.get(w) || 0) + 1));
        chunks.push({ file: f, index: i, text: t, tf, len: tokens.length });
      });
    }
    const df = new Map();
    chunks.forEach((c) => c.tf.forEach((_, w) => df.set(w, (df.get(w) || 0) + 1)));
    const avgLen = chunks.length ? chunks.reduce((s, c) => s + c.len, 0) / chunks.length : 0;
    cache = { sig, chunks, df, avgLen };
    return cache;
  }

  function search(query, limit = 4) {
    const q = [...new Set(tokenize(query))];
    if (!q.length) return [];
    const { chunks, df, avgLen } = build();
    const N = chunks.length;
    const k1 = 1.5, b = 0.75;
    return chunks
      .map((c) => {
        let score = 0;
        for (const w of q) {
          const f = c.tf.get(w);
          if (!f) continue;
          const idf = Math.log(1 + (N - df.get(w) + 0.5) / (df.get(w) + 0.5));
          score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * c.len) / (avgLen || 1))));
        }
        return { file: c.file, index: c.index, text: c.text, score };
      })
      .filter((c) => c.score > 0)
      .sort((a, b2) => b2.score - a.score)
      .slice(0, limit);
  }

  function read(name) {
    const n = safeName(name);
    if (!ALLOWED.test(n)) return null;
    try {
      return fs.readFileSync(path.join(dir, n), "utf8");
    } catch {
      return null;
    }
  }

  function write(name, buf) {
    const n = safeName(name);
    if (!ALLOWED.test(n)) throw new Error("Only .txt, .md, .csv, .json and .log files are supported.");
    fs.writeFileSync(path.join(dir, n), buf);
    return n;
  }

  function remove(name) {
    const n = safeName(name);
    if (!ALLOWED.test(n)) return false;
    try {
      fs.unlinkSync(path.join(dir, n));
      return true;
    } catch {
      return false;
    }
  }

  return { list, search, read, write, remove, tokenize, chunkText };
}

module.exports = { createKnowledge, tokenize, chunkText, safeName, ALLOWED };
