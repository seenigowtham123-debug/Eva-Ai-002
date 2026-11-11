// Live lookups so Eva can answer about recent events: Google Custom Search (optional key),
// Wikipedia (no key) and Google News RSS (no key). Everything is best-effort and time-boxed:
// if the network is down, Eva simply answers without it.

const UA = "EvaAI/3.0 (self-hosted assistant)";
const TIMEOUT_MS = 3500;
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

const NEWS_RE =
  /\b(news|latest|today|yesterday|recent|recently|current|currently|breaking|election|minister|president|chief minister|politic\w*|government|parliament|budget|score|price|weather)\b|செய்தி|இன்று|நேற்று|சமீப|தற்போது|அரசியல்|தேர்தல்|முதல்வர்|அமைச்சர்|பிரதமர்|அரசு|ख़बर|खबर|समाचार|आज/i;

const decode = (s) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

async function fetchText(url) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.text;
  const r = await fetch(url, { headers: { "user-agent": UA, accept: "*/*" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const text = await r.text();
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  cache.set(url, { at: Date.now(), text });
  return text;
}

const lang = (q) => (/[\u0B80-\u0BFF]/.test(q) ? "ta" : /[\u0900-\u097F]/.test(q) ? "hi" : "en");

async function wikipedia(q) {
  const l = lang(q);
  const url =
    `https://${l}.wikipedia.org/w/api.php?action=query&generator=search&gsrlimit=3&gsrsearch=${encodeURIComponent(q.slice(0, 200))}` +
    "&prop=extracts|info&inprop=url&exintro=1&explaintext=1&exchars=700&format=json&formatversion=2";
  const pages = JSON.parse(await fetchText(url))?.query?.pages || [];
  return pages
    .sort((a, b) => (a.index || 0) - (b.index || 0))
    .filter((p) => p.extract)
    .map((p) => ({ kind: "Wikipedia", title: p.title, url: p.fullurl, text: p.extract.replace(/\s+/g, " ").trim() }));
}

async function googleNews(q) {
  const l = lang(q);
  const edition = { ta: "hl=ta&gl=IN&ceid=IN:ta", hi: "hl=hi&gl=IN&ceid=IN:hi", en: "hl=en-IN&gl=IN&ceid=IN:en" }[l];
  const xml = await fetchText(`https://news.google.com/rss/search?q=${encodeURIComponent(q.slice(0, 150))}&${edition}`);
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 6);
  const pick = (block, tag) => decode(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(block)?.[1] || "");
  return items.map((m) => ({ kind: "News", title: pick(m[1], "title"), url: pick(m[1], "link"), text: [pick(m[1], "source"), pick(m[1], "pubDate")].filter(Boolean).join(" · ") }));
}

async function googleSearch(q, cfg) {
  const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(cfg.googleKey)}&cx=${encodeURIComponent(cfg.googleCx)}&num=5&q=${encodeURIComponent(q.slice(0, 200))}`;
  return (JSON.parse(await fetchText(url)).items || []).map((i) => ({ kind: "Google", title: i.title, url: i.link, text: decode(i.snippet || "") }));
}

/** Returns { context, sources } for a user message. Never throws. */
async function gather(text, cfg) {
  const q = String(text || "").replace(/\s+/g, " ").trim();
  if (!cfg.webSearch || q.length < 8) return { context: "", sources: [], results: [] };
  const jobs = [];
  if (cfg.googleKey && cfg.googleCx) jobs.push(googleSearch(q, cfg));
  else jobs.push(wikipedia(q));
  if (NEWS_RE.test(q)) jobs.push(googleNews(q));
  const settled = await Promise.allSettled(jobs);
  const results = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : [])).filter((r) => r.title);
  if (!results.length) return { context: "", sources: [], results: [] };
  const context = results.map((r, i) => `[W${i + 1}] ${r.kind}: ${r.title}${r.text ? " — " + r.text : ""} (${r.url})`).join("\n");
  return { context, results, sources: results.map((r) => ({ title: r.title, url: r.url })) };
}

module.exports = { gather, NEWS_RE, decode, _cache: cache };
