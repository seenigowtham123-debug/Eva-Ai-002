// The conversation view: message thread, composer, streaming, voice and dictation.
import { api } from "./api.js";
import { icons } from "./icons.js";
import { renderMarkdown } from "./markdown.js";
import { openVoiceMode } from "./voice-mode.js";
import { supported, listen as listenOnce, speak, cancelSpeech, langOf } from "./voice.js";
import { h, toast } from "./ui.js";
import { $, state, S, save, bus, go, copyText, activeBrain, brainInfo, modelFor, hasRealBrain, BRAIN_LABEL, MOD } from "./core.js";
import { TOOL } from "./tools.js";
import { readImage, imagesFrom } from "./images.js";
import { extractAction, runAction } from "./actions.js";

// ---------------------------------------------------------------- list of saved chats
export async function refreshConvs() {
  try { state.convs = await api.conversations(); } catch (e) { if (e.status !== 401) toast(e.message, "err"); }
  bus.emit("convs");
}

export function newConversation() {
  if (state.streaming) stop();
  state.current = null;
  state.pending = [];
}

export async function openConversation(id) {
  if (state.streaming) stop();
  try {
    state.current = await api.conversation(id);
    state.current.mode ||= "chat";
    state.stick = true;
    return true;
  } catch (e) {
    toast(e.message, "err");
    return false;
  }
}

// ---------------------------------------------------------------- messages
function sourceChips(m) {
  return m.sources?.length ? h("span", { class: "chip", title: "Knowledge files used" }, h("span", { html: icons.book }), [...new Set(m.sources)].join(", ")) : null;
}

function errorBlock(msg) {
  const needsBrain = /API_KEY|Gemini key|No Gemini|not valid|connect a brain/i.test(msg);
  const offline = /Cannot reach the server|Failed to fetch|NetworkError/i.test(msg);
  return h("div", { class: "err-box", role: "alert" },
    h("span", { html: icons.warn }), h("div", {}, h("b", {}, offline ? "Eva cannot reach the server" : "That did not work"), h("p", {}, msg),
      needsBrain || offline ? h("button", { class: "btn sm", onClick: () => go("#/settings") }, needsBrain ? "Connect a brain" : "Fix the connection") : null));
}

function botNode(m, i, last) {
  const body = h("div", { class: "body" });
  if (m.streaming && !m.content) body.append(h("div", { class: "typing", "aria-label": "Thinking" }, h("i"), h("i"), h("i")));
  else {
    const prose = h("div", { class: "prose", html: renderMarkdown(m.content || "") });
    if (m.streaming) prose.classList.add("cursor"); else enhance(prose);
    body.append(prose);
  }
  if (m.error) body.append(errorBlock(m.error));
  if (m.action) body.append(h("div", { class: "action-card" }, h("span", { html: icons.play }), h("div", {}, h("b", {}, m.action.label), h("small", { class: "muted" }, m.action.risky ? "Tap to confirm. This will open your phone app." : "Tap to open.")),
    h("button", { class: "btn primary sm", type: "button", onClick: (e) => { runAction(m.action); e.currentTarget.textContent = "Done ✓"; e.currentTarget.disabled = true; } }, "Do it")));
  if (!m.streaming) {
    body.append(h("div", { class: "msg-actions" },
      m.content ? h("button", { class: "icon-btn", title: "Copy", "aria-label": "Copy answer", html: icons.copy, onClick: (e) => copyText(m.content, e.currentTarget) }) : null,
      m.content && supported.speak ? h("button", { class: "icon-btn", title: "Read aloud", "aria-label": "Read aloud", html: icons.speaker, onClick: () => speak(m.content, { lang: langOf(m.content, S().voiceLang) }) }) : null,
      last && !state.streaming ? h("button", { class: "icon-btn", title: "Regenerate", "aria-label": "Regenerate answer", html: icons.refresh, onClick: regenerate }) : null,
      m.brain ? h("span", { class: "chip" }, BRAIN_LABEL[m.brain] || m.brain) : null,
      sourceChips(m),
      m.partial ? h("span", { class: "chip warn" }, "Stopped") : null));
  }
  return h("div", { class: "msg bot", "data-i": i }, h("div", { class: "avatar" + (m.streaming ? " thinking" : ""), html: icons.tree }), body);
}

function userNode(m) {
  const long = m.content.length > 700 || m.content.split("\n").length > 14;
  const rich = m.content.includes("```");
  const bubble = h("div", { class: "bubble" + (rich ? " rich" : "") + (long ? " long" : ""), html: rich ? renderMarkdown(m.content) : null }, rich ? null : m.content);
  const node = h("div", { class: "msg user" }, h("div", { class: "ubox" },
    m.thumbs?.length ? h("div", { class: "thumbs" }, m.thumbs.map((u) => h("img", { src: u, alt: "attached image" }))) : m.attachments?.length ? h("div", { class: "thumbs" }, m.attachments.map((n) => h("span", { class: "chip" }, h("span", { html: icons.image }), n))) : null,
    m.content ? bubble : null,
    long ? h("button", { class: "more", type: "button", onClick: (e) => { bubble.classList.toggle("long"); e.currentTarget.textContent = bubble.classList.contains("long") ? "Show more" : "Show less"; } }, "Show more") : null));
  return node;
}

function welcome(tool) {
  return h("div", { class: "welcome" },
    h("div", { class: "welcome-tree", html: icons.tree }),
    h("h2", {}, tool.id === "chat" ? "What's on your mind?" : tool.name),
    h("p", {}, tool.desc),
    h("div", { class: "cards" }, tool.examples.map((x) => h("button", { class: "card", type: "button", onClick: () => send(x.text || x.set?.prompt || x.label) }, h("span", {}, x.label), h("span", { html: icons.arrow })))));
}

export function renderMessages() {
  const box = $("messages");
  if (!box) return;
  box.replaceChildren();
  const msgs = state.current?.messages || [];
  const tool = TOOL[state.current?.mode || "chat"];
  if (!msgs.length) { box.append(welcome(tool)); updateToBottom(); return; }
  const thread = h("div", { class: "thread" });
  msgs.forEach((m, i) => thread.append(m.role === "user" ? userNode(m) : botNode(m, i, i === msgs.length - 1)));
  box.append(thread);
  if (state.stick) box.scrollTop = box.scrollHeight;
  updateToBottom();
}

// Updates only the streaming bubble (cheap) instead of re-rendering the whole thread.
let raf = 0;
function paintStreaming() {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    const msgs = state.current?.messages;
    if (!msgs) return;
    const i = msgs.length - 1;
    const old = $("messages")?.querySelector(`.msg.bot[data-i="${i}"]`);
    if (!old) return renderMessages();
    const prose = old.querySelector(".prose");
    if (prose) { prose.innerHTML = renderMarkdown(msgs[i].content); prose.classList.add("cursor"); }
    else old.replaceWith(botNode(msgs[i], i, true));
    if (state.stick) $("messages").scrollTop = $("messages").scrollHeight;
  });
}

export function updateToBottom() {
  const b = $("messages"), t = $("toBottom");
  if (b && t) t.hidden = b.scrollHeight - b.scrollTop - b.clientHeight < 120;
}

// ---------------------------------------------------------------- code blocks and SVG art
const EXT = { python: "py", py: "py", javascript: "js", js: "js", typescript: "ts", ts: "ts", html: "html", css: "css", json: "json", java: "java", c: "c", cpp: "cpp", "c++": "cpp", csharp: "cs", "c#": "cs", go: "go", rust: "rs", php: "php", sql: "sql", bash: "sh", sh: "sh", svg: "svg", md: "md", yaml: "yml", kotlin: "kt", swift: "swift", r: "r", dart: "dart", text: "txt" };

function cleanSvg(src) {
  let s = src.trim();
  if (!/^<svg[\s>]/i.test(s) || !/<\/svg>\s*$/i.test(s)) return "";
  s = s.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, "").replace(/(xlink:)?href\s*=\s*(["'])(?!#)[^"']*\2/gi, "");
  if (!/xmlns\s*=/.test(s)) s = s.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return s;
}
const svgUrl = (s) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);

function enhance(root) {
  root.querySelectorAll(".code").forEach((box) => {
    const head = box.querySelector(".code-head");
    const lang = (head?.querySelector("span")?.textContent || "text").toLowerCase();
    head?.insertBefore(h("button", { type: "button", class: "code-copy", "data-save": lang }, "Save"), head.lastElementChild);
    if (lang !== "svg") return;
    const svg = cleanSvg(box.querySelector("code").textContent);
    if (!svg) return;
    box.before(h("figure", { class: "art" }, h("img", { src: svgUrl(svg), alt: "Image created by Eva" }),
      h("figcaption", {}, h("button", { type: "button", class: "btn sm", "data-art": "svg" }, h("span", { html: icons.download }), "SVG"), h("button", { type: "button", class: "btn sm", "data-art": "png" }, h("span", { html: icons.download }), "PNG"))));
  });
}

function download(blob, name) {
  const a = h("a", { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

/** One click handler for everything clickable inside the thread. */
export function threadClicks(e) {
  const copy = e.target.closest("[data-copy]");
  if (copy) { copyText(copy.closest(".code").querySelector("code").textContent, null).then(() => { copy.textContent = "Copied"; setTimeout(() => (copy.textContent = "Copy"), 1200); }); return; }
  const sv = e.target.closest("[data-save]");
  if (sv) { download(new Blob([sv.closest(".code").querySelector("code").textContent], { type: "text/plain" }), "eva-code." + (EXT[sv.dataset.save] || "txt")); return; }
  const art = e.target.closest("[data-art]");
  if (art) {
    const img = art.closest(".art").querySelector("img");
    const text = decodeURIComponent(img.src.split(",").slice(1).join(","));
    if (art.dataset.art === "svg") return download(new Blob([text], { type: "image/svg+xml" }), "eva-art.svg");
    const im = new Image();
    im.onload = () => {
      const c = h("canvas"), k = 1600 / Math.max(im.naturalWidth || 800, 1);
      c.width = Math.round((im.naturalWidth || 800) * k); c.height = Math.round((im.naturalHeight || 600) * k);
      c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
      c.toBlob((b) => (b ? download(b, "eva-art.png") : toast("Could not make a PNG.", "err")));
    };
    im.onerror = () => toast("Could not make a PNG.", "err");
    im.src = img.src;
  }
}

// ---------------------------------------------------------------- composer
const canAttach = () => ["chat", "image"].includes(state.current?.mode || "chat");

export async function addImages(files) {
  for (const f of files) {
    if (state.pending.length >= 4) { toast("At most 4 images per message.", "err"); break; }
    try { state.pending.push(await readImage(f)); } catch (e) { toast(e.message, "err"); }
  }
  renderComposer();
}

export function renderComposer() {
  const wrap = $("composerWrap");
  if (!wrap) return;
  const prev = $("input");
  const draft = prev ? prev.value : "";
  const had = prev && document.activeElement === prev;
  const real = hasRealBrain();
  const ta = h("textarea", { id: "input", rows: "1", placeholder: TOOL[state.current?.mode || "chat"].placeholder || "Ask a follow-up…", "aria-label": "Message", value: draft, onInput: autosize,
    onPaste: (e) => { const f = imagesFrom(e.clipboardData); if (f.length && canAttach()) { e.preventDefault(); addImages(f); } },
    onKeydown: (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); } } });

  const picker = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif", multiple: true, hidden: true, onChange: (e) => { addImages([...e.target.files]); e.target.value = ""; } });
  const thumbs = state.pending.length ? h("div", { class: "pending" }, state.pending.map((im, i) => h("div", { class: "pend" }, h("img", { src: im.url, alt: im.name }), h("button", { type: "button", class: "x", "aria-label": "Remove image", html: icons.x, onClick: () => { state.pending.splice(i, 1); renderComposer(); } })))) : null;

  const brains = ["auto", "builtin", "gemini", "claude", "ollama"];
  const brainSel = h("select", { class: "pill", title: "Which AI answers", "aria-label": "Brain", onChange: (e) => { S().brain = e.target.value; save(); bus.emit("brain"); } },
    brains.map((b) => h("option", { value: b, selected: S().brain === b }, (b === "auto" ? "Auto · " + (BRAIN_LABEL[state.config?.autoBrain] || "…") : BRAIN_LABEL[b]) + (b !== "auto" && state.config && !state.config.brains[b]?.available ? " (not set up)" : ""))));
  const kb = h("button", { class: "pill hide-sm", type: "button", title: "Use your knowledge notes", "aria-pressed": String(S().useKnowledge), onClick: () => { S().useKnowledge = !S().useKnowledge; save(); renderComposer(); $("input").focus(); } }, S().useKnowledge ? "📚 Notes on" : "📚 Notes off");
  const web = h("button", { class: "pill hide-sm", type: "button", title: "Look things up on the web (Wikipedia / News)", "aria-pressed": String(S().useWeb), onClick: () => { S().useWeb = !S().useWeb; save(); renderComposer(); $("input").focus(); } }, S().useWeb ? "🌍 Web on" : "🌍 Web off");
  const attach = canAttach() ? h("button", { class: "mic", type: "button", title: "Attach an image", "aria-label": "Attach an image", html: icons.clip, onClick: () => picker.click() }) : null;
  const mic = h("button", { class: "mic" + (state.dictation ? " on" : ""), type: "button", title: "Dictate (speak your message)", "aria-label": "Dictate", "aria-pressed": String(Boolean(state.dictation)), html: icons.mic, onClick: toggleDictation });
  const eva = h("button", { class: "mic eva-btn", type: "button", title: "Talk with Eva (voice mode)", "aria-label": "Start voice mode", html: icons.wave, onClick: startVoiceMode });
  const sendBtn = h("button", { id: "send", class: "send", type: "submit", title: state.streaming ? "Stop (Esc)" : "Send (Enter)", "aria-label": state.streaming ? "Stop generating" : "Send message", html: state.streaming ? icons.stop : icons.send, onClick: (e) => { if (state.streaming) { e.preventDefault(); stop(); } } });
  const form = h("form", { class: "composer", onSubmit: (e) => { e.preventDefault(); if (!state.streaming) submit(); } }, thumbs, ta, h("div", { class: "composer-bar" }, attach, picker, brainSel, kb, web, h("span", { class: "grow" }), mic, eva, sendBtn));
  const hint = !state.online ? h("div", { class: "hint warn" }, "Server not reachable. ", h("a", { href: "#/settings" }, "Fix the connection"))
    : !real ? h("div", { class: "hint" }, "Built-in mode (no AI model). ", h("a", { href: "#/settings" }, "Connect a free Gemini key"), " for full answers.")
    : h("div", { class: "hint" }, "Enter to send · Shift+Enter for a new line · " + MOD + "K for commands");
  wrap.replaceChildren(form, hint);
  autosize.call(ta);
  if (had) ta.focus();
}
function autosize() { this.style.height = "auto"; this.style.height = Math.min(this.scrollHeight, 220) + "px"; }

function submit() {
  const ta = $("input");
  const text = ta.value.trim();
  if ((!text && !state.pending.length) || state.streaming) return;
  ta.value = ""; autosize.call(ta);
  send(text);
}

// ---------------------------------------------------------------- voice
function toggleDictation() {
  if (!supported.listen) return toast("Dictation needs Chrome or Edge.", "err");
  if (state.dictation) { state.dictation.stop(); return; }
  const ta = $("input"), base = ta.value ? ta.value.trimEnd() + " " : "";
  const r = listenOnce({ lang: S().voiceLang, onInterim: (t) => { ta.value = base + t; autosize.call(ta); } });
  state.dictation = r; renderComposer();
  r.done.then((t) => { if (t) { $("input").value = base + t; autosize.call($("input")); } })
    .catch((e) => toast(e.message, "err"))
    .finally(() => { state.dictation = null; renderComposer(); $("input")?.focus(); });
}

export function startVoiceMode() {
  if (state.voiceMode) return;
  state.dictation?.stop();
  state.voiceMode = openVoiceMode({
    getLang: () => S().voiceLang,
    ask: (text) => send(text, { voice: true }),
    cancelAsk: stop,
    toast,
    onClose: () => { state.voiceMode = null; renderComposer(); bus.emit("voice-closed"); },
  }) || null;
}

// ---------------------------------------------------------------- one chat turn
/**
 * Sends a message in the current conversation (or starts one).
 * opts: { regenerate, voice, mode, title, images }
 */
export async function send(text, { regenerate = false, voice = false, mode, title, images } = {}) {
  if (state.streaming) return;
  if (!state.current) state.current = { id: null, title: title || "New chat", mode: mode || "chat", messages: [] };
  const conv = state.current;
  const imgs = regenerate ? conv._images || [] : images || [...state.pending];
  if (regenerate) { while (conv.messages.at(-1)?.role === "assistant") conv.messages.pop(); }
  else {
    conv.messages.push({ role: "user", content: text, thumbs: imgs.map((i) => i.url), attachments: imgs.map((i) => i.name) });
    conv._images = imgs;
    state.pending = [];
  }
  const bot = { role: "assistant", content: "", streaming: true };
  conv.messages.push(bot);
  state.streaming = true; state.stick = true;
  state.abort = new AbortController();
  bus.emit("streaming");
  renderMessages(); renderComposer();

  const explicit = S().brain && S().brain !== "auto";
  try {
    await api.chat({
      conversationId: conv.id, message: regenerate ? undefined : text, regenerate, title: !conv.id ? title : undefined, mode: conv.mode,
      brain: explicit ? S().brain : "auto", model: explicit ? modelFor(S().brain) || undefined : undefined,
      images: imgs.map(({ mime, data, name }) => ({ mime, data, name })),
      language: S().language, temperature: S().temperature ?? undefined, systemPrompt: S().systemPrompt, useKnowledge: S().useKnowledge, useWeb: S().useWeb, voice,
      actions: voice || Boolean(window.Capacitor?.isNativePlatform?.()),
    }, {
      signal: state.abort.signal,
      onMeta: (m) => { conv.id = m.conversationId; conv.title = m.title; bot.sources = m.sources; bot.brain = m.brain; bus.emit("title"); },
      onDelta: (t) => { bot.content += t; paintStreaming(); },
      onError: (msg) => { bot.error = msg; },
    });
  } catch (e) {
    if (e.name === "AbortError") bot.partial = true;
    else { bot.error = /Failed to fetch|NetworkError|Load failed/i.test(e.message) ? "Cannot reach the server. Is it running?" : e.message; if (bot.error.startsWith("Cannot reach")) { state.online = false; bus.emit("online"); } }
  } finally {
    bot.streaming = false;
    if (state.abort?.signal.aborted && bot.content) bot.partial = true;
    { const x = extractAction(bot.content); if (x.action) { bot.action = x.action; bot.content = x.text; } }
    state.streaming = false; state.abort = null;
    if (!bot.content && !bot.error && !bot.partial) conv.messages.pop();
    bus.emit("streaming");
    renderMessages(); renderComposer();
    if (!state.voiceMode) $("input")?.focus();
    refreshConvs();
  }
  if (!voice && S().speakReplies && bot.content && !bot.error) speak(bot.content, { lang: langOf(bot.content, S().voiceLang) });
  return bot;
}

export function stop() { cancelSpeech(); state.abort?.abort(); }
export function regenerate() { if (state.current?.messages.length && !state.streaming) send("", { regenerate: true }); }

export const brainSummary = () => {
  const id = activeBrain();
  return { id, label: BRAIN_LABEL[id] || id, ok: Boolean(brainInfo(id)?.available), model: modelFor(id) };
};
