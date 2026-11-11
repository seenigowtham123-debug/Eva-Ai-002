// Thin client for the backend: finds the server by itself, handles the optional access token and Server-Sent Events.
const TOKEN_KEY = "eva.token";
const API_KEY = "eva.api";
export const auth = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; } },
  set: (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked */ } },
  onRequired: null, // set by the UI: () => Promise<boolean> that asks for the token
};

const store = {
  get: () => { try { return localStorage.getItem(API_KEY) || ""; } catch { return ""; } },
  set: (v) => { try { v ? localStorage.setItem(API_KEY, v) : localStorage.removeItem(API_KEY); } catch { /* storage blocked */ } },
};

let BASE = "";
export const getBase = () => BASE;
export const isFileProtocol = location.protocol === "file:";

export class ApiError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

const clean = (u) => String(u || "").trim().replace(/\/+$/, "").replace(/^(?!https?:\/\/)(.+)$/i, "http://$1");

/** Asks `base` whether an Eva server lives there. Resolves with the health JSON or null. */
async function probe(base, ms = 1800) {
  try {
    const r = await fetch(base + "/api/health", { signal: AbortSignal.timeout(ms) });
    if (!r.ok) return null;
    const j = await r.json();
    return j?.app === "eva-ai" ? j : null;
  } catch {
    return null;
  }
}

/**
 * Finds the Eva server. Tries, in order: the address saved by the user, a <meta name="eva-api"> tag,
 * this same origin (when the page is served by Eva itself), then port 3000 on this computer.
 * That is why the page works from `npm start`, from VS Code Live Server and from other local ports.
 */
export async function discover() {
  const host = location.hostname || "localhost";
  const list = [store.get(), document.querySelector('meta[name="eva-api"]')?.content, /^https?:$/.test(location.protocol) ? "" : null,
    `http://${host === "127.0.0.1" ? "127.0.0.1" : "localhost"}:3000`, "http://127.0.0.1:3000", "http://localhost:3001"]
    .filter((x) => x !== null && x !== undefined);
  const seen = new Set();
  for (const raw of list) {
    const base = raw === "" ? "" : clean(raw);
    if (seen.has(base)) continue;
    seen.add(base);
    const health = await probe(base);
    if (health) { BASE = base; return { base: base || location.origin, health }; }
  }
  return null;
}

/** Tries one address typed by the user. Saves it when it works. */
export async function useServer(url) {
  const base = clean(url);
  const health = await probe(base, 3000);
  if (!health) return null;
  BASE = base;
  store.set(base);
  return { base, health };
}
export const forgetServer = () => store.set("");

function headers(extra = {}) {
  const t = auth.get();
  return { ...(t ? { Authorization: "Bearer " + t } : {}), ...extra };
}

async function request(path, opts = {}, retry = true) {
  const r = await fetch(BASE + path, { ...opts, headers: headers(opts.headers) });
  if (r.status === 401 && retry && auth.onRequired && (await auth.onRequired())) return request(path, opts, false);
  if (!r.ok) {
    let data = {};
    try { data = await r.json(); } catch { /* not json */ }
    throw new ApiError(data.error || `Request failed (${r.status})`, r.status, data.code);
  }
  return r;
}

const json = (method, body, extra = {}) => ({ method, headers: { "content-type": "application/json", ...extra }, body: JSON.stringify(body ?? {}) });

export const api = {
  config: () => request("/api/config").then((r) => r.json()),
  health: () => fetch(BASE + "/api/health", { signal: AbortSignal.timeout(4000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  checkToken: (token) => fetch(BASE + "/api/auth", json("POST", { token })).then((r) => r.json()),
  /** Saves an API key into the server's .env (only works from the same computer). */
  setup: (keys) => request("/api/setup", json("POST", keys, { "x-eva-setup": "1" })).then((r) => r.json()),
  testBrain: (brain) => request("/api/brain/test", json("POST", { brain })).then((r) => r.json()),
  conversations: () => request("/api/conversations").then((r) => r.json()).then((d) => d.conversations),
  conversation: (id) => request("/api/conversations/" + id).then((r) => r.json()),
  renameConversation: (id, title) => request("/api/conversations/" + id, json("PATCH", { title })).then((r) => r.json()),
  deleteConversation: (id) => request("/api/conversations/" + id, { method: "DELETE" }),
  deleteAllConversations: () => request("/api/conversations", { method: "DELETE" }),
  knowledge: () => request("/api/knowledge").then((r) => r.json()).then((d) => d.files),
  knowledgeText: (name) => request("/api/knowledge/" + encodeURIComponent(name)).then((r) => r.text()),
  knowledgeSearch: (q) => request("/api/knowledge/search?q=" + encodeURIComponent(q)).then((r) => r.json()).then((d) => d.results),
  deleteKnowledge: (name) => request("/api/knowledge/" + encodeURIComponent(name), { method: "DELETE" }),
  upload: (files) => {
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    return request("/api/upload", { method: "POST", body: fd }).then((r) => r.json());
  },

  // Streams a chat turn. Callbacks: onMeta, onDelta, onError. Resolves when the stream ends.
  async chat(payload, { signal, onMeta, onDelta, onError }) {
    const r = await request("/api/chat", { ...json("POST", payload), signal });
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    const dispatch = (block) => {
      const ev = /^event: (.*)$/m.exec(block)?.[1];
      const raw = /^data: (.*)$/m.exec(block)?.[1];
      if (!ev || raw === undefined) return;
      const data = JSON.parse(raw);
      if (ev === "meta") onMeta?.(data);
      else if (ev === "delta") onDelta?.(data.text);
      else if (ev === "error") onError?.(data.error);
    };
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        dispatch(buf.slice(0, i));
        buf = buf.slice(i + 2);
      }
    }
    if (buf.trim()) dispatch(buf);
  },
};
