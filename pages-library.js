// History and Knowledge pages.
import { api } from "./api.js";
import { icons } from "./icons.js";
import { h, toast, confirmDialog, promptDialog, fmtBytes, groupByDate, openModal } from "./ui.js";
import { state, $ } from "./core.js";
import { TOOLS, TOOL } from "./tools.js";
import { refreshConvs } from "./chat.js";
import { renderMarkdown } from "./markdown.js";

export function renderHistory(host) {
  let filter = "all", q = "";
  const list = h("div", { class: "hist-list" });
  const draw = () => {
    const items = state.convs.filter((c) => (filter === "all" || (c.mode || "chat") === filter) && (!q || c.title.toLowerCase().includes(q)));
    list.replaceChildren();
    if (!items.length) { list.append(h("div", { class: "empty" }, h("span", { html: icons.history }), h("p", {}, state.convs.length ? "No chats match." : "No chats yet. Start one from the home page."))); return; }
    for (const [label, group] of groupByDate(items)) {
      list.append(h("h3", { class: "sec-s" }, label));
      for (const c of group) {
        const t = TOOL[c.mode || "chat"] || TOOL.chat;
        list.append(h("div", { class: "hist-item" },
          h("a", { href: `#/t/${t.id}/${c.id}`, class: "hi-main" }, h("span", { class: "tb-ic", vars: { "--hue": t.hue }, html: icons[t.icon] }), h("span", { class: "hi-t" }, h("b", {}, c.title), h("span", { class: "muted" }, `${t.name} · ${c.count} messages · ${new Date(c.updatedAt).toLocaleString()}`))),
          h("button", { class: "icon-btn", title: "Rename", "aria-label": "Rename", html: icons.edit, onClick: async () => { const n = await promptDialog("Rename chat", c.title); if (n) { await api.renameConversation(c.id, n); refreshConvs(); } } }),
          h("button", { class: "icon-btn", title: "Delete", "aria-label": "Delete", html: icons.trash, onClick: async () => { if (await confirmDialog("Delete chat?", `"${c.title}" will be removed.`, "Delete", true)) { await api.deleteConversation(c.id); if (state.current?.id === c.id) state.current = null; refreshConvs(); } } })));
      }
    }
  };
  const chips = h("div", { class: "chips" }, [["all", "All"], ...TOOLS.map((t) => [t.id, t.name])].map(([id, n]) => h("button", { class: "chip btn-chip" + (id === filter ? " on" : ""), type: "button", onClick: (e) => { filter = id; chips.querySelectorAll(".chip").forEach((c) => c.classList.remove("on")); e.currentTarget.classList.add("on"); draw(); } }, n)));
  host.replaceChildren(h("div", { class: "page plain" }, h("header", { class: "plain-head" }, h("h1", {}, "History", h("span", { class: "ta" }, "உரையாடல்கள்")), h("p", { class: "muted" }, "Everything you asked Eva, saved on your server.")),
    h("input", { class: "input", type: "search", placeholder: "Search your chats…", "aria-label": "Search chats", onInput: (e) => { q = e.target.value.trim().toLowerCase(); draw(); } }), chips, list));
  draw();
  const off = () => draw();
  return () => { void off; };
}

export async function renderKnowledge(host) {
  const files = h("div", { class: "kb-files" });
  const found = h("div", { class: "kb-found" });
  const load = async () => {
    let fs = [];
    try { fs = await api.knowledge(); } catch (e) { toast(e.message, "err"); }
    files.replaceChildren(...(fs.length ? fs.map((f) => h("div", { class: "kb-file" },
      h("button", { class: "kb-open", type: "button", onClick: async () => { const t = await api.knowledgeText(f.name).catch((e) => e.message); openModal({ title: f.name, wide: true, body: h("div", { class: "prose", html: renderMarkdown(t.slice(0, 20000)) }), actions: [{ label: "Close" }] }); } }, h("span", { html: icons.book }), h("span", {}, h("b", {}, f.name), h("span", { class: "muted" }, fmtBytes(f.size)))),
      h("button", { class: "icon-btn", title: "Delete", "aria-label": "Delete " + f.name, html: icons.trash, onClick: async () => { if (await confirmDialog("Delete file?", f.name, "Delete", true)) { await api.deleteKnowledge(f.name); load(); } } }))) : [h("div", { class: "empty" }, h("span", { html: icons.book }), h("p", {}, "No notes yet. Add .md, .txt or .pdf files and Eva will use them when answering."))]));
  };
  const picker = h("input", { type: "file", multiple: true, hidden: true, accept: ".md,.txt,.markdown,.csv,.json,.pdf,text/*", onChange: async (e) => { await up([...e.target.files]); e.target.value = ""; } });
  const up = async (fs) => { if (!fs.length) return; try { const r = await api.upload(fs); toast(`${r.saved?.length || 0} file(s) added` + (r.rejected?.length ? `, ${r.rejected.length} not supported` : "")); load(); } catch (e) { toast(e.message, "err"); } };
  const zone = h("div", { class: "drop", tabindex: "0", role: "button", "aria-label": "Add knowledge files", onClick: () => picker.click(), onKeydown: (e) => { if (e.key === "Enter") picker.click(); },
    onDragover: (e) => { e.preventDefault(); zone.classList.add("over"); }, onDragleave: () => zone.classList.remove("over"), onDrop: (e) => { e.preventDefault(); zone.classList.remove("over"); up([...e.dataTransfer.files]); } },
    h("div", { class: "drop-empty" }, h("span", { class: "drop-ic", html: icons.upload }), h("b", {}, "Drop notes here, or click to add"), h("span", { class: "muted" }, "Markdown, text, CSV, JSON or PDF")), picker);
  const search = h("input", { class: "input", type: "search", placeholder: "Test a search in your notes…", "aria-label": "Search notes", onInput: (() => { let t; return (e) => { clearTimeout(t); t = setTimeout(async () => { const v = e.target.value.trim(); if (!v) return found.replaceChildren(); const r = await api.knowledgeSearch(v).catch(() => []); found.replaceChildren(...(r.length ? r.map((x) => h("blockquote", {}, x.text.slice(0, 300), h("div", { class: "muted" }, x.file))) : [h("p", { class: "muted" }, "Nothing found.")])); }, 250); }; })() });
  host.replaceChildren(h("div", { class: "page plain" }, h("header", { class: "plain-head" }, h("h1", {}, "Knowledge", h("span", { class: "ta" }, "குறிப்புகள்")), h("p", { class: "muted" }, "Eva reads these files first when you ask something related.")), zone, h("h3", { class: "sec-s" }, "Your files"), files, h("h3", { class: "sec-s" }, "Try a search"), search, found));
  load();
}
