const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { startApp, readSSE, post } = require("./helpers");
const { calc, buildReply } = require("../src/builtin");

test("calc is a safe calculator", () => {
  assert.equal(calc("2+3*4"), 14);
  assert.equal(calc("(2+3)*4"), 20);
  assert.equal(calc("2^10"), 1024);
  assert.equal(calc("10/4"), 2.5);
  assert.equal(calc("1,000 + 500"), 1500);
  assert.equal(calc("process.exit()"), null);
  assert.equal(calc("hello"), null);
  assert.equal(calc("5"), null);
  assert.equal(calc("1/0"), null);
});

test("built-in brain answers maths, greetings, notes and says what it needs", () => {
  const ask = (q, extra = {}) => buildReply({ messages: [{ role: "user", content: q }], ...extra });
  assert.match(ask("what is 12*12"), /144/);
  assert.match(ask("hello"), /built-in mode/);
  assert.match(ask("வணக்கம்"), /ஈவா/);
  assert.match(ask("tell me a story", { kb: [{ file: "a.md", text: "Eva notes here" }] }), /Eva notes here/);
  assert.match(ask("write a python script", { mode: "code" }), /Gemini/);
  assert.match(ask("what time is it", { now: new Date("2026-01-02T10:30:00") }), /2026/);
});

test("with no keys, auto brain falls back to the built-in brain and still streams", async () => {
  const app = await startApp({ defaultBrain: "auto", anthropicKey: "", geminiKey: "" });
  try {
    const cfg = await (await fetch(app.base + "/api/config")).json();
    assert.equal(cfg.autoBrain, "builtin");
    assert.equal(cfg.brains.builtin.available, true);
    const ev = await readSSE(await post(app.base + "/api/chat", { message: "what is 6*7", useWeb: false }));
    assert.equal(ev[0].data.brain, "builtin");
    assert.match(ev.filter((e) => e.event === "delta").map((e) => e.data.text).join(""), /42/);
    assert.equal(ev.at(-1).event, "done");
  } finally { await app.close(); }
});

function mockGemini(onRequest) {
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      onRequest({ url: req.url, headers: req.headers, body: JSON.parse(body || "{}") });
      res.writeHead(200, { "content-type": "text/event-stream" });
      for (const t of ["Gem", "ini ok"]) res.write(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }] })}\r\n\r\n`);
      res.end();
    });
  });
  return new Promise((r) => server.listen(0, () => r(server)));
}

test("Gemini brain streams, sends the key in a header, and forwards images and mode prompt", async () => {
  let seen;
  const g = await mockGemini((r) => (seen = r));
  const app = await startApp({ defaultBrain: "auto", anthropicKey: "", geminiKey: "g-test-key-1234567890", geminiUrl: `http://127.0.0.1:${g.address().port}` });
  try {
    const img = { mime: "image/png", data: Buffer.from("fakepng").toString("base64"), name: "cat.png" };
    const ev = await readSSE(await post(app.base + "/api/chat", { message: "what is this?", mode: "image", images: [img], useWeb: false }));
    assert.equal(ev[0].data.brain, "gemini");
    assert.equal(ev[0].data.mode, "image");
    assert.equal(ev.filter((e) => e.event === "delta").map((e) => e.data.text).join(""), "Gemini ok");
    assert.equal(seen.headers["x-goog-api-key"], "g-test-key-1234567890");
    assert.match(seen.url, /gemini-test:streamGenerateContent\?alt=sse/);
    assert.equal(seen.body.contents.at(-1).parts[0].inlineData.mimeType, "image/png");
    assert.match(seen.body.systemInstruction.parts[0].text, /Image Studio/);
    const conv = await (await fetch(app.base + "/api/conversations/" + ev[0].data.conversationId)).json();
    assert.equal(conv.mode, "image");
    assert.deepEqual(conv.messages[0].attachments, ["cat.png"]);
    assert.equal(conv.messages[0].images, undefined);
  } finally { await app.close(); g.close(); }
});

test("image validation rejects bad types and too many images", async () => {
  const app = await startApp({ defaultBrain: "builtin" });
  try {
    const ok = { mime: "image/png", data: "aGk=" };
    let r = await post(app.base + "/api/chat", { message: "x", images: [{ mime: "image/svg+xml", data: "aGk=" }] });
    assert.equal(r.status, 400);
    r = await post(app.base + "/api/chat", { message: "x", images: [{ mime: "image/png", data: "not base64!!" }] });
    assert.equal(r.status, 400);
    r = await post(app.base + "/api/chat", { message: "x", images: Array(5).fill(ok) });
    assert.equal(r.status, 400);
  } finally { await app.close(); }
});

test("setup saves a key to .env only from this computer", async () => {
  const fs = require("fs");
  const app = await startApp({ defaultBrain: "auto" });
  try {
    let r = await post(app.base + "/api/setup", { geminiKey: "AIzaSyExampleKey1234567890" });
    assert.equal(r.status, 403); // missing the x-eva-setup header
    r = await post(app.base + "/api/setup", { geminiKey: "bad key" }, { "x-eva-setup": "1" });
    assert.equal(r.status, 400);
    r = await post(app.base + "/api/setup", { geminiKey: "AIzaSyExampleKey1234567890" }, { "x-eva-setup": "1" });
    assert.equal(r.status, 200);
    assert.match(fs.readFileSync(app.cfg.envFile, "utf8"), /GEMINI_API_KEY=AIzaSyExampleKey1234567890/);
    assert.equal((await (await fetch(app.base + "/api/config")).json()).brains.gemini.available, true);
    r = await post(app.base + "/api/setup", { geminiKey: "AIzaSyExampleKey1234567890" }, { "x-eva-setup": "1", "x-forwarded-for": "8.8.8.8" });
    assert.equal(r.status, 403); // proxied requests are refused
  } finally { await app.close(); }
});

test("health describes the app so the UI can find the server; CORS allows any local port", async () => {
  const app = await startApp();
  try {
    const h = await (await fetch(app.base + "/api/health", { headers: { origin: "http://localhost:5501" } })).json();
    assert.equal(h.app, "eva-ai");
    assert.equal(h.ready.builtin, true);
    const res = await fetch(app.base + "/api/health", { headers: { origin: "http://127.0.0.1:5173" } });
    assert.equal(res.headers.get("access-control-allow-origin"), "http://127.0.0.1:5173");
  } finally { await app.close(); }
});

test("brain test reports a bad key instead of failing silently", async () => {
  const app = await startApp({ defaultBrain: "auto", anthropicKey: "", geminiKey: "AIzaBadKey1234567890", geminiUrl: "http://127.0.0.1:1" });
  try {
    const bad = await (await post(app.base + "/api/brain/test", { brain: "gemini" })).json();
    assert.equal(bad.ok, false);
    assert.match(bad.error, /Gemini/);
    const ok = await (await post(app.base + "/api/brain/test", { brain: "builtin" })).json();
    assert.equal(ok.ok, true);
  } finally { await app.close(); }
});

test("phone actions: only validated, user-confirmable actions come out of a reply", async () => {
  const { extractAction, normalise } = await import("../public/js/actions.js");
  const r = extractAction('Sure, opening it.\nACTION: {"type":"youtube","query":"lofi songs"}');
  assert.equal(r.text, "Sure, opening it.");
  assert.equal(r.action.url, "https://www.youtube.com/results?search_query=lofi%20songs");
  assert.equal(normalise({ type: "open_url", url: "javascript:alert(1)" }), null);
  assert.equal(normalise({ type: "open_url", url: "http://insecure.example" }), null);
  assert.equal(normalise({ type: "call", to: "98 76; rm -rf" }), null);
  assert.equal(normalise({ type: "call", to: "+91 98765 43210" }).url, "tel:+919876543210");
  assert.equal(normalise({ type: "sms", to: "9876543210", body: "hi there" }).risky, true);
  assert.equal(normalise({ type: "wipe_phone" }), null);
  assert.equal(extractAction("no action here").action, null);
});

test("actions hint is sent to the model only when the client asks for it", async () => {
  let seen = [];
  const g = await mockGemini((r) => seen.push(r.body.systemInstruction.parts[0].text));
  const app = await startApp({ defaultBrain: "gemini", geminiKey: "g-test-key-1234567890", geminiUrl: `http://127.0.0.1:${g.address().port}` });
  try {
    await readSSE(await post(app.base + "/api/chat", { message: "open youtube", actions: true, useWeb: false }));
    await readSSE(await post(app.base + "/api/chat", { message: "hello", useWeb: false }));
    assert.match(seen[0], /ACTION: \{json\}/);
    assert.doesNotMatch(seen[1], /ACTION: \{json\}/);
  } finally { await app.close(); g.close(); }
});
