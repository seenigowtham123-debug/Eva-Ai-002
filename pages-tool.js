// A tool page: a form to start (or the chat welcome), then the conversation with its composer.
import { icons } from "./icons.js";
import { h, toast, promptDialog } from "./ui.js";
import { state, go, $ } from "./core.js";
import { TOOL, defaults } from "./tools.js";
import { send, renderMessages, renderComposer, threadClicks, updateToBottom, addImages, newConversation, refreshConvs } from "./chat.js";
import { readImage, imagesFrom } from "./images.js";
import { api } from "./api.js";

const toolTitleBar = (tool) => h("header", { class: "tool-bar" },
  h("a", { class: "icon-btn", href: "#/home", title: "Home", "aria-label": "Home", html: icons.home }),
  h("span", { class: "tb-ic", vars: { "--hue": tool.hue }, html: icons[tool.icon] }),
  h("button", { class: "tb-title", type: "button", title: "Rename", onClick: rename }, h("b", {}, state.current?.title && state.current.messages.length ? state.current.title : tool.name), h("span", { class: "muted" }, tool.ta)),
  h("span", { class: "grow" }),
  state.current?.messages.length ? h("button", { class: "btn sm", type: "button", onClick: exportChat }, h("span", { html: icons.download }), "Export") : null,
  h("button", { class: "btn sm", type: "button", onClick: () => { newConversation(); go("#/t/" + tool.id); } }, h("span", { html: icons.plus }), "New"));

async function rename() {
  const c = state.current;
  if (!c?.id) return;
  const t = await promptDialog("Rename chat", c.title);
  if (t) { await api.renameConversation(c.id, t).catch((e) => toast(e.message, "err")); c.title = t; refreshConvs(); renderToolPage(); }
}
function exportChat() {
  const c = state.current;
  const md = `# ${c.title}\n\n` + c.messages.map((m) => `**${m.role === "user" ? "You" : "Eva"}:**\n\n${m.content}`).join("\n\n---\n\n");
  const a = h("a", { href: URL.createObjectURL(new Blob([md], { type: "text/markdown" })), download: (c.title || "chat").replace(/[^\w\- ]+/g, "").slice(0, 40) + ".md" });
  document.body.append(a); a.click(); a.remove();
}

// ---- the start form ----
function field(tool, f, v, redraw) {
  if (f.showIf && !f.showIf(v)) return null;
  if (f.type === "seg") return h("div", { class: "seg", role: "group" }, f.options.map(([val, label]) => h("button", { type: "button", class: v[f.key] === val ? "on" : "", "aria-pressed": String(v[f.key] === val), onClick: () => { v[f.key] = val; redraw(); } }, label)));
  if (f.type === "select") {
    let opts = f.options;
    if (f.langs) opts = [...(f.noAuto ? [] : ["Auto-detect"]), ...(state.config?.languages || ["English", "Tamil", "Hindi"]).filter((l) => l !== "Auto-detect")];
    return h("label", { class: "fld" }, h("span", {}, f.label), h("select", { class: "input", onChange: (e) => { v[f.key] = e.target.value; } }, opts.map((o) => h("option", { value: o, selected: v[f.key] === o }, o))));
  }
  if (f.type === "text") return h("label", { class: "fld wide" }, h("span", {}, f.label), h("textarea", { class: "input" + (f.mono ? " mono" : ""), rows: String(f.rows || 4), placeholder: f.placeholder || "", spellcheck: f.mono ? "false" : "true", value: v[f.key], onInput: (e) => { v[f.key] = e.target.value; } }));
  if (f.type === "images") {
    const picker = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif", multiple: true, hidden: true, onChange: async (e) => { await take([...e.target.files]); e.target.value = ""; } });
    const take = async (files) => { for (const file of files) { if (v.images.length >= 4) { toast("At most 4 images.", "err"); break; } try { v.images.push(await readImage(file)); } catch (err) { toast(err.message, "err"); } } redraw(); };
    const zone = h("div", { class: "drop", tabindex: "0", role: "button", "aria-label": "Add images", onClick: () => picker.click(),
      onKeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); picker.click(); } },
      onDragover: (e) => { e.preventDefault(); zone.classList.add("over"); }, onDragleave: () => zone.classList.remove("over"),
      onDrop: (e) => { e.preventDefault(); zone.classList.remove("over"); take(imagesFrom(e.dataTransfer)); } },
      v.images.length ? h("div", { class: "drop-thumbs" }, v.images.map((im, i) => h("div", { class: "pend" }, h("img", { src: im.url, alt: im.name }), h("button", { type: "button", class: "x", "aria-label": "Remove", html: icons.x, onClick: (e) => { e.stopPropagation(); v.images.splice(i, 1); redraw(); } }))), h("span", { class: "muted" }, "Add more"))
        : h("div", { class: "drop-empty" }, h("span", { class: "drop-ic", html: icons.image }), h("b", {}, "Drop images here, or click to choose"), h("span", { class: "muted" }, f.hint)), picker);
    zone._paste = (e) => { const fs = imagesFrom(e.clipboardData); if (fs.length) { e.preventDefault(); take(fs); } };
    return zone;
  }
  return null;
}

function renderForm(tool, host) {
  const v = (state.forms[tool.id] ||= defaults(tool));
  const redraw = () => renderForm(tool, host);
  const submit = () => {
    const bad = tool.validate ? tool.validate(v) : tool.fields.find((f) => f.required && !String(v[f.key] || "").trim()) ? "Fill in the required box." : !String(v.prompt || "").trim() && !tool.fields.some((f) => f.type === "images") ? "Type something first." : "";
    if (bad) return toast(bad, "err");
    const r = tool.build(v);
    state.current = { id: null, title: r.title, mode: tool.id, messages: [], started: true };
    renderToolPage();
    send(r.message, { title: r.title, images: r.images });
  };
  const ctrls = tool.fields.filter((f) => f.type !== "text" && f.type !== "images");
  const selects = ctrls.filter((f) => f.type === "select").map((f) => field(tool, f, v, redraw));
  const rest = tool.fields.filter((f) => f.type === "text" || f.type === "images" || f.type === "seg").map((f) => field(tool, f, v, redraw));
  const segs = rest.filter((n) => n?.classList?.contains("seg"));
  const others = rest.filter((n) => n && !n.classList.contains("seg"));
  const form = h("form", { class: "tool-form", onSubmit: (e) => { e.preventDefault(); submit(); } },
    segs, h("div", { class: "fld-row" }, selects), others,
    h("div", { class: "form-actions" }, h("span", { class: "muted" }, "Ctrl+Enter to send"), h("button", { class: "btn primary lg", type: "submit" }, "Ask Eva ", h("span", { html: icons.arrow }))));
  form.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } });
  form.addEventListener("paste", (e) => form.querySelector(".drop")?._paste?.(e));
  const examples = h("div", { class: "examples" }, h("span", { class: "muted" }, "Try one:"), tool.examples.map((x) => h("button", { class: "chip btn-chip", type: "button", onClick: () => { Object.assign(v, x.set); redraw(); } }, x.label)));
  const mine = state.convs.filter((c) => c.mode === tool.id).slice(0, 4);
  host.replaceChildren(...[form, examples, mine.length ? h("div", { class: "recent small" }, h("h3", { class: "sec-s" }, "Recent in " + tool.name), mine.map((c) => h("a", { class: "recent-item", href: `#/t/${tool.id}/${c.id}` }, h("span", { class: "ri-t" }, c.title), h("span", { class: "muted" }, new Date(c.updatedAt).toLocaleDateString())))) : null].filter(Boolean));
}

// ---- the page ----
let currentTool = null;
export function renderToolPage() {
  const tool = currentTool;
  const host = $("page");
  const inThread = tool.id === "chat" || state.current?.messages.length || state.current?.started;
  if (!inThread) {
    host.replaceChildren(h("div", { class: "page tool", vars: { "--hue": tool.hue } },
      h("header", { class: "tool-banner" }, h("a", { class: "back", href: "#/home" }, h("span", { html: icons.home }), "Home"),
        h("span", { class: "tb-big", html: icons[tool.icon] }), h("h1", {}, tool.name, h("span", { class: "ta" }, tool.ta)), h("p", {}, tool.desc)),
      h("div", { class: "tool-wrap", id: "toolForm" })));
    renderForm(tool, $("toolForm"));
    return;
  }
  const to = h("button", { class: "to-bottom", id: "toBottom", "aria-label": "Scroll to latest", html: icons.down, hidden: true, onClick: () => { state.stick = true; $("messages").scrollTop = $("messages").scrollHeight; } });
  const msgs = h("section", { class: "messages", id: "messages", "aria-live": "polite", tabindex: "-1",
    onScroll() { state.stick = this.scrollHeight - this.scrollTop - this.clientHeight < 80; updateToBottom(); }, onClick: threadClicks,
    onDragover: (e) => e.preventDefault(), onDrop: (e) => { const f = imagesFrom(e.dataTransfer); if (f.length) { e.preventDefault(); addImages(f); } } });
  host.replaceChildren(h("div", { class: "page chat-page", vars: { "--hue": tool.hue } }, toolTitleBar(tool), msgs, to, h("footer", { class: "composer-wrap", id: "composerWrap" })));
  renderMessages(); renderComposer();
}

/** Route entry: #/t/<tool> or #/t/<tool>/<conversationId>. */
export async function showTool(toolId, convId, openConversation) {
  currentTool = TOOL[toolId] || TOOL.chat;
  if (convId) {
    if (state.current?.id !== convId && !(await openConversation(convId))) return go("#/t/" + currentTool.id);
  } else if (!state.autostart && state.current && (state.current.mode !== currentTool.id || state.current.id)) {
    state.current = null;
  }
  const auto = state.autostart;
  state.autostart = null;
  if (auto && !state.current) state.current = { id: null, title: auto.title || "New chat", mode: currentTool.id, messages: [], started: true };
  renderToolPage();
  if (auto) send(auto.text, { title: auto.title, images: auto.images });
  else if (currentTool.id === "chat" || state.current?.messages.length) $("input")?.focus();
}
