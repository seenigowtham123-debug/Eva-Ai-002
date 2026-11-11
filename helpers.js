const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("../src/app");

// A fake Anthropic API that streams "Hello world" as SSE.
function mockClaude(onRequest) {
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const parsed = JSON.parse(body || "{}");
      onRequest?.(parsed, req.headers);
      if (parsed.system?.includes("FAIL_PLEASE")) {
        res.writeHead(400, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: { message: "boom from upstream" } }));
      }
      res.writeHead(200, { "content-type": "text/event-stream" });
      const ev = (t, d) => res.write(`event: ${t}\ndata: ${JSON.stringify({ type: t, ...d })}\n\n`);
      ev("message_start", { message: {} });
      for (const w of ["Hello", " ", "**world**"]) ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: w } });
      ev("message_stop", {});
      res.end();
    });
  });
  return new Promise((r) => server.listen(0, () => r(server)));
}

function mockOllama() {
  const server = http.createServer((req, res) => {
    if (req.url === "/api/tags") return res.end(JSON.stringify({ models: [{ name: "llama3.1" }, { name: "qwen2.5" }] }));
    req.resume();
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/x-ndjson" });
      res.write(JSON.stringify({ message: { content: "Hi " } }) + "\n");
      res.write(JSON.stringify({ message: { content: "there" }, done: true }) + "\n");
      res.end();
    });
  });
  return new Promise((r) => server.listen(0, () => r(server)));
}

async function startApp(overrides = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "eva-test-"));
  const cfg = {
    root: path.join(__dirname, ".."),
    defaultBrain: "claude",
    anthropicKey: "test-key",
    anthropicUrl: "http://127.0.0.1:1",
    claudeModel: "claude-sonnet-5-5",
    claudeModels: [],
    geminiKey: "",
    geminiUrl: "http://127.0.0.1:1",
    geminiModel: "gemini-test",
    geminiModels: [],
    envFile: path.join(tmp, ".env"),
    ollamaUrl: "http://127.0.0.1:1",
    ollamaModel: "llama3.1",
    maxTokens: 256,
    historyLimit: 30,
    accessToken: "",
    dataDir: path.join(tmp, "data"),
    knowledgeDir: path.join(tmp, "knowledge"),
    chatRatePerMin: 1000,
    apiRatePerMin: 1000,
    corsOrigin: "",
    trustProxy: 1,
    ...overrides,
  };
  const server = createApp(cfg).listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { cfg, base, close: () => new Promise((r) => (server.closeAllConnections?.(), server.close(r))), tmp };
}

// Reads an SSE response into [{event, data}]
async function readSSE(res) {
  const text = await res.text();
  return text
    .split("\n\n")
    .filter(Boolean)
    .map((blk) => {
      const ev = /^event: (.*)$/m.exec(blk)?.[1];
      const data = JSON.parse(/^data: (.*)$/m.exec(blk)?.[1] || "null");
      return { event: ev, data };
    });
}

const post = (url, body, headers = {}) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

module.exports = { mockClaude, mockOllama, startApp, readSSE, post };
