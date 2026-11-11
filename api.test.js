const test = require("node:test");
const assert = require("node:assert/strict");
const { mockClaude, mockOllama, startApp, readSSE, post } = require("./helpers");

test("serves the UI with security headers and a health check", async () => {
  const app = await startApp();
  try {
    const r = await fetch(app.base + "/");
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /text\/html/);
    assert.match(r.headers.get("content-security-policy"), /default-src 'self'/);
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    const h = await (await fetch(app.base + "/api/health")).json();
    assert.equal(h.ok, true);
    assert.equal((await fetch(app.base + "/../server.js")).status, 404);
    assert.equal((await fetch(app.base + "/%2e%2e/server.js")).status, 404);
  } finally {
    await app.close();
  }
});

test("access token gates the API but not health or the UI", async () => {
  const app = await startApp({ accessToken: "s3cret" });
  try {
    assert.equal((await fetch(app.base + "/")).status, 200);
    assert.equal((await fetch(app.base + "/api/health")).status, 200);
    assert.equal((await fetch(app.base + "/api/config")).status, 401);
    assert.equal((await fetch(app.base + "/api/config", { headers: { authorization: "Bearer wrong" } })).status, 401);
    assert.equal((await fetch(app.base + "/api/config", { headers: { authorization: "Bearer s3cret" } })).status, 200);
    assert.equal((await post(app.base + "/api/auth", { token: "s3cret" })).status, 200);
    assert.equal((await post(app.base + "/api/auth", { token: "nope" })).status, 401);
  } finally {
    await app.close();
  }
});

test("conversation CRUD", async () => {
  const app = await startApp();
  try {
    const c = await (await post(app.base + "/api/conversations", {})).json();
    assert.ok(c.id);
    let list = await (await fetch(app.base + "/api/conversations")).json();
    assert.equal(list.conversations.length, 1);
    const patched = await (await fetch(`${app.base}/api/conversations/${c.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Renamed" }) })).json();
    assert.equal(patched.title, "Renamed");
    assert.equal((await fetch(`${app.base}/api/conversations/../etc`)).status, 404);
    assert.equal((await fetch(`${app.base}/api/conversations/not-a-valid-id`)).status, 404);
    assert.equal((await fetch(`${app.base}/api/conversations/${c.id}`, { method: "DELETE" })).status, 200);
    list = await (await fetch(app.base + "/api/conversations")).json();
    assert.equal(list.conversations.length, 0);
  } finally {
    await app.close();
  }
});

test("knowledge: upload, rank, read, delete, reject bad names", async () => {
  const app = await startApp();
  try {
    const fd = new FormData();
    fd.append("files", new Blob(["Eva stores recipes.\n\nThe Tamil festival Pongal is celebrated in January with sweet rice."]), "notes.md");
    fd.append("files", new Blob(["x"]), "evil.exe");
    fd.append("files", new Blob(["Path trick content for the knowledge base."]), "../../escape.txt");
    const up = await (await fetch(app.base + "/api/upload", { method: "POST", body: fd })).json();
    assert.deepEqual(up.saved.sort(), ["escape.txt", "notes.md"]);
    assert.deepEqual(up.rejected, ["evil.exe"]);
    const search = await (await fetch(app.base + "/api/knowledge/search?q=" + encodeURIComponent("when is Pongal celebrated"))).json();
    assert.equal(search.results[0].file, "notes.md");
    assert.match(await (await fetch(app.base + "/api/knowledge/notes.md")).text(), /Pongal/);
    assert.equal((await fetch(app.base + "/api/knowledge/notes.md", { method: "DELETE" })).status, 200);
    assert.equal((await fetch(app.base + "/api/knowledge/notes.md")).status, 404);
  } finally {
    await app.close();
  }
});

test("chat streams from Claude, saves history, supports regenerate", async () => {
  let seen;
  const upstream = await mockClaude((b) => (seen = b));
  const app = await startApp({ anthropicUrl: `http://127.0.0.1:${upstream.address().port}` });
  try {
    const res = await post(app.base + "/api/chat", { message: "Say hello", language: "French", temperature: 0.3 });
    assert.equal(res.headers.get("content-type"), "text/event-stream; charset=utf-8");
    const events = await readSSE(res);
    assert.equal(events[0].event, "meta");
    assert.equal(events.filter((e) => e.event === "delta").map((e) => e.data.text).join(""), "Hello **world**");
    assert.equal(events.at(-1).event, "done");
    assert.equal(seen.stream, true);
    assert.equal(seen.temperature, 0.3);
    assert.match(seen.system, /Reply language: French/);
    assert.equal(seen.model, "claude-sonnet-5-5");

    const id = events[0].data.conversationId;
    let conv = await (await fetch(`${app.base}/api/conversations/${id}`)).json();
    assert.equal(conv.title, "Say hello");
    assert.deepEqual(conv.messages.map((m) => m.role), ["user", "assistant"]);

    await readSSE(await post(app.base + "/api/chat", { conversationId: id, regenerate: true }));
    conv = await (await fetch(`${app.base}/api/conversations/${id}`)).json();
    assert.deepEqual(conv.messages.map((m) => m.role), ["user", "assistant"], "regenerate replaces the last answer");
  } finally {
    await app.close();
    upstream.close();
  }
});

test("chat injects knowledge notes and reports sources", async () => {
  let seen;
  const upstream = await mockClaude((b) => (seen = b));
  const app = await startApp({ anthropicUrl: `http://127.0.0.1:${upstream.address().port}` });
  try {
    const fd = new FormData();
    fd.append("files", new Blob(["The warp drive on the Zephyr-9 ship needs 42 gigawatts of power."]), "ship.txt");
    await fetch(app.base + "/api/upload", { method: "POST", body: fd });
    const events = await readSSE(await post(app.base + "/api/chat", { message: "How much power does the Zephyr-9 warp drive need?" }));
    assert.deepEqual(events[0].data.sources, ["ship.txt"]);
    assert.match(seen.system, /42 gigawatts/);
    const off = await readSSE(await post(app.base + "/api/chat", { message: "How much power does the Zephyr-9 warp drive need?", useKnowledge: false }));
    assert.deepEqual(off[0].data.sources, []);
  } finally {
    await app.close();
    upstream.close();
  }
});

test("upstream and missing-key errors surface as SSE error events", async () => {
  const upstream = await mockClaude();
  const app = await startApp({ anthropicUrl: `http://127.0.0.1:${upstream.address().port}` });
  try {
    const ev = await readSSE(await post(app.base + "/api/chat", { message: "x", systemPrompt: "FAIL_PLEASE" }));
    assert.equal(ev.find((e) => e.event === "error").data.error, "boom from upstream");
  } finally {
    await app.close();
    upstream.close();
  }
  const nokey = await startApp({ anthropicKey: "" });
  try {
    const ev = await readSSE(await post(nokey.base + "/api/chat", { message: "x" }));
    assert.match(ev.find((e) => e.event === "error").data.error, /ANTHROPIC_API_KEY/);
  } finally {
    await nokey.close();
  }
});

test("Ollama brain streams NDJSON and config lists local models", async () => {
  const ol = await mockOllama();
  const app = await startApp({ ollamaUrl: `http://127.0.0.1:${ol.address().port}` });
  try {
    const events = await readSSE(await post(app.base + "/api/chat", { message: "hi", brain: "ollama" }));
    assert.equal(events.filter((e) => e.event === "delta").map((e) => e.data.text).join(""), "Hi there");
    const cfg = await (await fetch(app.base + "/api/config")).json();
    assert.equal(cfg.brains.ollama.available, true);
    assert.deepEqual(cfg.brains.ollama.models, ["llama3.1", "qwen2.5"]);
    assert.ok(cfg.languages.length >= 130);
  } finally {
    await app.close();
    ol.close();
  }
});

test("validation and rate limiting", async () => {
  const app = await startApp({ chatRatePerMin: 2 });
  try {
    assert.equal((await post(app.base + "/api/chat", { message: "  " })).status, 400);
    assert.equal((await post(app.base + "/api/chat", { message: "x", conversationId: "deadbeef-0000" })).status, 404);
    const bad = await fetch(app.base + "/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: "{oops" });
    assert.equal(bad.status, 400);
    assert.equal((await post(app.base + "/api/chat", { message: "  " })).status, 429);
  } finally {
    await app.close();
  }
});
