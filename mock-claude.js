// A fake Anthropic API so you can try the whole UI without an API key or network.
//   Terminal 1: node scripts/mock-claude.js
//   Terminal 2: ANTHROPIC_BASE_URL=http://localhost:4010 ANTHROPIC_API_KEY=demo npm start
const http = require("http");

const REPLY = "This is a **mock reply** from `scripts/mock-claude.js`.\n\n```js\nconsole.log('Eva AI is running');\n```\n\nSet a real `ANTHROPIC_API_KEY` and remove `ANTHROPIC_BASE_URL` to talk to Claude.";

http
  .createServer((req, res) => {
    req.resume();
    req.on("end", async () => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      for (let i = 0; i < REPLY.length; i += 5) {
        const delta = { type: "content_block_delta", delta: { type: "text_delta", text: REPLY.slice(i, i + 5) } };
        res.write(`event: content_block_delta\ndata: ${JSON.stringify(delta)}\n\n`);
        await new Promise((r) => setTimeout(r, 20));
      }
      res.end();
    });
  })
  .listen(4010, () => console.log("Mock Claude API on http://localhost:4010"));
