// Conversation storage: one JSON file per conversation, written atomically.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ID_RE = /^[a-f0-9-]{8,64}$/;
const MAX_MESSAGES = 400;

function createStore(dataDir) {
  const dir = path.join(dataDir, "conversations");
  fs.mkdirSync(dir, { recursive: true });
  const file = (id) => path.join(dir, `${id}.json`);

  function get(id) {
    if (!ID_RE.test(id)) return null;
    try {
      return JSON.parse(fs.readFileSync(file(id), "utf8"));
    } catch {
      return null;
    }
  }

  function save(conv) {
    if (!ID_RE.test(conv.id)) throw new Error("Invalid conversation id");
    conv.messages = conv.messages.slice(-MAX_MESSAGES);
    conv.updatedAt = new Date().toISOString();
    const tmp = file(conv.id) + "." + process.pid + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(conv));
    fs.renameSync(tmp, file(conv.id));
    return conv;
  }

  function create(title = "New chat", mode = "chat") {
    const now = new Date().toISOString();
    return save({ id: crypto.randomUUID(), title, mode, createdAt: now, updatedAt: now, messages: [] });
  }

  function list() {
    const out = [];
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      const c = get(f.slice(0, -5));
      if (c) out.push({ id: c.id, title: c.title, updatedAt: c.updatedAt, createdAt: c.createdAt, mode: c.mode || "chat", count: c.messages.length });
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  function remove(id) {
    if (!ID_RE.test(id)) return false;
    try {
      fs.unlinkSync(file(id));
      return true;
    } catch {
      return false;
    }
  }

  function clear() {
    for (const f of fs.readdirSync(dir)) if (f.endsWith(".json")) fs.unlinkSync(path.join(dir, f));
  }

  return { get, save, create, list, remove, clear, ID_RE };
}

module.exports = { createStore };
