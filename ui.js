// DOM helpers, dialogs, toasts and the command palette.
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v; // only ever called with trusted/escaped strings
    else if (k === "vars") for (const [a, b] of Object.entries(v)) el.style.setProperty(a, b); // CSS variables (CSP-safe, unlike style="")
    else if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "value") el.value = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}

const overlay = () => document.getElementById("overlay");
const stack = [];

export function closeTopModal() {
  const top = stack.pop();
  if (top) top();
  return Boolean(top);
}
export const hasModal = () => stack.length > 0;

export function openModal({ title, body, actions = [], wide = false, center = true, onClose, className = "" }) {
  const prevFocus = document.activeElement;
  const back = h("div", { class: "modal-back" + (center ? " center" : "") });
  const box = h("div", { class: "modal " + (wide ? "wide " : "") + className, role: "dialog", "aria-modal": "true", "aria-label": title || "Dialog" });
  if (title) box.append(h("h3", {}, title));
  if (body) box.append(h("div", { class: "m-body" }, body));
  let close;
  if (actions.length) {
    box.append(h("div", { class: "m-foot" }, actions.map((a) => h("button", { class: "btn " + (a.primary ? "primary" : a.danger ? "danger" : ""), type: "button", onClick: () => a.onClick?.(close) ?? close() }, a.label))));
  }
  back.append(box);
  back.addEventListener("mousedown", (e) => { if (e.target === back) close(); });
  overlay().append(back);
  close = () => {
    const i = stack.indexOf(close);
    if (i >= 0) stack.splice(i, 1);
    back.remove();
    onClose?.();
    prevFocus?.focus?.();
  };
  stack.push(close);
  (box.querySelector("[autofocus], input, textarea") || box.querySelector(".btn.primary, .btn"))?.focus();
  return close;
}

export function confirmDialog(title, text, okLabel = "OK", danger = false) {
  return new Promise((resolve) => {
    let done = false;
    const fin = (v) => (c) => { done = true; resolve(v); c(); };
    openModal({
      title, body: h("p", {}, text),
      actions: [{ label: "Cancel", onClick: fin(false) }, { label: okLabel, primary: !danger, danger, onClick: fin(true) }],
      onClose: () => !done && resolve(false),
    });
  });
}

export function promptDialog(title, value = "", label = "") {
  return new Promise((resolve) => {
    let done = false;
    const input = h("input", { class: "input", value, "aria-label": label || title, autofocus: true, maxlength: "120" });
    const fin = (c, v) => { done = true; resolve(v); c(); };
    openModal({
      title, body: input,
      actions: [{ label: "Cancel", onClick: (c) => fin(c, null) }, { label: "Save", primary: true, onClick: (c) => fin(c, input.value.trim() || null) }],
      onClose: () => !done && resolve(null),
    });
    input.select();
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); done = true; resolve(input.value.trim() || null); closeTopModal(); } });
  });
}

export function toast(msg, kind = "") {
  const t = h("div", { class: "toast " + kind }, msg);
  document.getElementById("toasts").append(t);
  setTimeout(() => t.remove(), kind === "err" ? 5000 : 2600);
}

// Command palette: commands = [{ id, label, hint?, run }]
export function openPalette(commands, placeholder = "Type a command…") {
  let sel = 0;
  let shown = commands;
  const input = h("input", { placeholder, "aria-label": placeholder, autocomplete: "off", spellcheck: "false" });
  const list = h("ul", { role: "listbox" });
  const back = h("div", { class: "modal-back" });
  const box = h("div", { class: "modal palette", role: "dialog", "aria-modal": "true", "aria-label": "Command palette" }, input, list);
  back.append(box);
  const prevFocus = document.activeElement;
  let close;

  const score = (label, q) => {
    label = label.toLowerCase();
    if (label.includes(q)) return 100 - label.indexOf(q);
    let i = 0;
    for (const ch of label) if (ch === q[i]) i++;
    return i === q.length ? 1 : 0;
  };
  const draw = () => {
    list.replaceChildren();
    if (!shown.length) list.append(h("div", { class: "empty-note" }, "No matching commands"));
    shown.slice(0, 60).forEach((c, i) => {
      const li = h("li", { class: i === sel ? "sel" : "", role: "option", "aria-selected": String(i === sel), onMousemove: () => { if (sel !== i) { sel = i; draw(); } }, onClick: () => run(c) }, h("span", {}, c.label), c.hint ? h("kbd", {}, c.hint) : null);
      list.append(li);
    });
    list.querySelector(".sel")?.scrollIntoView({ block: "nearest" });
  };
  const run = (c) => { close(); c.run(); };
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    shown = q ? commands.map((c) => [c, score(c.label, q)]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]).map((x) => x[0]) : commands;
    sel = 0;
    draw();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { sel = Math.min(sel + 1, Math.min(shown.length, 60) - 1); draw(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { sel = Math.max(sel - 1, 0); draw(); e.preventDefault(); }
    else if (e.key === "Enter" && shown[sel] && !e.isComposing) { e.preventDefault(); run(shown[sel]); }
  });
  back.addEventListener("mousedown", (e) => { if (e.target === back) close(); });
  close = () => { const i = stack.indexOf(close); if (i >= 0) stack.splice(i, 1); back.remove(); prevFocus?.focus?.(); };
  stack.push(close);
  overlay().append(back);
  draw();
  input.focus();
}

export function fmtBytes(n) {
  return n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(1) + " KB" : (n / 1048576).toFixed(1) + " MB";
}

export function groupByDate(items, key = "updatedAt") {
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOfDay(new Date());
  const groups = new Map();
  for (const it of items) {
    const d = startOfDay(new Date(it[key]));
    const days = Math.round((today - d) / 86400000);
    const g = days <= 0 ? "Today" : days === 1 ? "Yesterday" : days < 8 ? "Previous 7 days" : days < 31 ? "Previous 30 days" : "Older";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(it);
  }
  return groups;
}
