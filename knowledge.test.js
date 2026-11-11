const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createKnowledge, chunkText, safeName, tokenize } = require("../src/knowledge");
const { createStore } = require("../src/store");

test("tokenize keeps non-Latin words and drops stopwords", () => {
  assert.deepEqual(tokenize("The வணக்கம் world"), ["வணக்கம்", "world"]);
});

test("chunkText groups paragraphs and splits oversize ones", () => {
  const chunks = chunkText(("word ".repeat(300) + "\n\n").repeat(3));
  assert.ok(chunks.length >= 3);
  assert.ok(chunks.every((c) => c.length <= 1200));
});

test("safeName strips paths and odd characters", () => {
  assert.equal(safeName("../../etc/passwd"), "passwd");
  assert.equal(safeName("..hidden.txt"), "hidden.txt");
  assert.equal(safeName("a<b>.md"), "a_b_.md");
});

test("BM25 prefers the rarer, more specific match", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-"));
  const kb = createKnowledge(dir);
  kb.write("a.md", Buffer.from("Cats are common pets and people like cats a lot.\n\nQuasar telescopes detect radio waves from distant galaxies."));
  kb.write("b.md", Buffer.from("Dogs are common pets and people like dogs."));
  assert.equal(kb.search("quasar telescope")[0].file, "a.md");
  assert.equal(kb.search("zzzzzz").length, 0);
  kb.write("c.md", Buffer.from("A brand new quasar note appears here with enough text."));
  assert.ok(kb.search("quasar").some((r) => r.file === "c.md"), "index refreshes after a new file");
});

test("store rejects bad ids and round-trips conversations", () => {
  const s = createStore(fs.mkdtempSync(path.join(os.tmpdir(), "st-")));
  assert.equal(s.get("../../x"), null);
  const c = s.create("Hello");
  c.messages.push({ role: "user", content: "hi" });
  s.save(c);
  assert.equal(s.get(c.id).messages.length, 1);
  assert.equal(s.list()[0].count, 1);
  assert.equal(s.remove(c.id), true);
  assert.equal(s.get(c.id), null);
});
