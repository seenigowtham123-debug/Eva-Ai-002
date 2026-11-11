const test = require("node:test");
const assert = require("node:assert/strict");
const web = require("../src/web");
const { mockClaude, startApp, readSSE, post } = require("./helpers");

const realFetch = globalThis.fetch;
const wikiBody = JSON.stringify({ query: { pages: [{ index: 1, title: "Pongal", fullurl: "https://en.wikipedia.org/wiki/Pongal", extract: "Pongal is a multi-day Tamil harvest festival." }] } });
const rss = `<rss><channel><item><title><![CDATA[Rain hits Chennai]]></title><link>https://news.example/1</link><pubDate>Sun, 25 Oct 2026</pubDate><source url="x">The Hindu</source></item></channel></rss>`;

function fakeNet() {
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes("wikipedia.org")) return new Response(wikiBody);
    if (u.includes("news.google.com")) return new Response(rss);
    return realFetch(url, init);
  };
}

test("gather returns Wikipedia and news context and survives failures", async () => {
  web._cache.clear(); fakeNet();
  try {
    const r = await web.gather("what is the latest news about Pongal festival", { webSearch: true });
    assert.match(r.context, /Wikipedia: Pongal/);
    assert.match(r.context, /News: Rain hits Chennai/);
    assert.equal(r.sources.length, 2);
    web._cache.clear();
    globalThis.fetch = async () => { throw new Error("offline"); };
    assert.deepEqual(await web.gather("tell me about Pongal festival", { webSearch: true }), { context: "", sources: [], results: [] });
    assert.deepEqual(await web.gather("hi", { webSearch: true }), { context: "", sources: [], results: [] });
    assert.deepEqual(await web.gather("tell me about Pongal festival", { webSearch: false }), { context: "", sources: [], results: [] });
  } finally { globalThis.fetch = realFetch; }
});

test("chat injects live web results and the voice hint into the system prompt", async () => {
  web._cache.clear();
  let seen = "";
  const claude = await mockClaude((body) => { seen = body.system; });
  const app = await startApp({ anthropicUrl: `http://127.0.0.1:${claude.address().port}`, webSearch: true });
  fakeNet();
  try {
    const r = await post(app.base + "/api/chat", { message: "tell me about the Pongal festival", useWeb: true, voice: true });
    await readSSE(r);
    assert.match(seen, /Live web results/);
    assert.match(seen, /Pongal is a multi-day/);
    assert.match(seen, /talking to you by voice/);
    seen = "";
    await readSSE(await post(app.base + "/api/chat", { message: "tell me about the Pongal festival", useWeb: false }));
    assert.doesNotMatch(seen, /Live web results/);
  } finally { globalThis.fetch = realFetch; await app.close(); claude.close(); }
});

test("CORS allows VS Code Go Live origins only", async () => {
  const app = await startApp();
  try {
    const ok = await fetch(app.base + "/api/health", { headers: { origin: "http://localhost:5500" } });
    assert.equal(ok.headers.get("access-control-allow-origin"), "http://localhost:5500");
    const bad = await fetch(app.base + "/api/health", { headers: { origin: "https://evil.example" } });
    assert.equal(bad.headers.get("access-control-allow-origin"), null);
    assert.match((await fetch(app.base + "/")).headers.get("permissions-policy"), /microphone=\(self\)/);
  } finally { await app.close(); }
});
