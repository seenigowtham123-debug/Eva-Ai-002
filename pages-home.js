// Home: the Eva tree hero, a prompt box, then one card per tool.
import { EvaTree } from "./eva-tree.js";
import { icons } from "./icons.js";
import { h } from "./ui.js";
import { state, go, greeting, hasRealBrain } from "./core.js";
import { TOOLS, TOOL } from "./tools.js";
import { brainCards } from "./connect.js";
import { startVoiceMode } from "./chat.js";
import { supported } from "./voice.js";

const STARTERS = ["Explain AI in simple Tamil", "Write a Python script to rename files", "Fix my JavaScript error", "Plan my study week"];

export function launch(toolId, text, extra = {}) {
  state.current = { id: null, title: "New chat", mode: toolId, messages: [], started: true };
  state.autostart = { text, ...extra };
  go("#/t/" + toolId);
}

export function renderHome(host) {
  const canvas = h("canvas", { class: "hero-canvas", "aria-hidden": "true" });
  let tree;
  const ta = h("textarea", { rows: "1", placeholder: "Ask Eva anything…  எதுவும் கேளுங்கள்", "aria-label": "Ask Eva", onFocus: () => tree?.setState("listening"), onBlur: () => tree?.setState("idle"),
    onInput() { this.style.height = "auto"; this.style.height = Math.min(this.scrollHeight, 140) + "px"; },
    onKeydown(e) { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); } } });
  const submit = () => { const t = ta.value.trim(); if (!t) return; tree?.setState("thinking"); launch("chat", t); };

  const hero = h("section", { class: "hero" }, canvas,
    h("div", { class: "hero-text" },
      h("span", { class: "eyebrow" }, h("span", { html: icons.sparkle }), "Eva AI · your AI workspace"),
      h("h1", {}, greeting(), ", ", h("span", { class: "grad" }, "நான் ஈவா")),
      h("p", {}, "Ask anything. Code, solve, debug and draw, in Tamil, English or both.")),
    h("div", { class: "hero-bottom" },
      h("form", { class: "hero-prompt", onSubmit: (e) => { e.preventDefault(); submit(); } }, ta,
        supported.listen ? h("button", { class: "mic eva-btn", type: "button", title: "Talk with Eva", "aria-label": "Talk with Eva", html: icons.wave, onClick: startVoiceMode }) : null,
        h("button", { class: "send", type: "submit", title: "Send", "aria-label": "Send", html: icons.send })),
      h("div", { class: "chips" }, STARTERS.map((s) => h("button", { class: "chip btn-chip", type: "button", onClick: () => launch("chat", s) }, s)))));

  const cards = [...TOOLS.filter((t) => t.id !== "chat"), { id: "voice", name: "Voice assistant", ta: "குரல் உதவியாளர்", tag: "Talk hands-free, Eva talks back", icon: "wave", hue: 190 }, { id: "knowledge", name: "Knowledge", ta: "குறிப்புகள்", tag: "Teach Eva your own notes and files", icon: "book", hue: 35 }];
  const grid = h("div", { class: "tool-grid" }, cards.map((t, i) => h("a", { class: "tool-card", href: t.id === "voice" ? "#/home" : t.id === "knowledge" ? "#/knowledge" : "#/t/" + t.id, vars: { "--hue": t.hue, "--i": i },
    onClick: t.id === "voice" ? (e) => { e.preventDefault(); startVoiceMode(); } : null },
    h("span", { class: "tc-icon", html: icons[t.icon] }), h("b", {}, t.name), h("span", { class: "ta" }, t.ta), h("p", {}, t.tag), h("span", { class: "tc-go", html: icons.arrow }))));

  const recent = state.convs.slice(0, 4);
  const body = h("section", { class: "home-body" },
    hasRealBrain() || !state.online ? null : h("div", { class: "quick-start" }, h("div", {}, h("h2", {}, "Give Eva a brain: free, one minute"), h("p", { class: "muted" }, "Right now Eva runs in built-in mode. Paste a free Gemini key to unlock coding, images and long answers.")), brainCards({ only: ["gemini"] })),
    h("h2", { class: "sec" }, "What do you want to do?"),
    grid,
    recent.length ? h("h2", { class: "sec" }, "Continue where you left off") : null,
    recent.length ? h("div", { class: "recent" }, recent.map((c) => h("a", { class: "recent-item", href: `#/t/${c.mode || "chat"}/${c.id}` }, h("span", { class: "ri-ic", html: icons[TOOL[c.mode || "chat"]?.icon || "chat"] }), h("span", { class: "ri-t" }, c.title), h("span", { class: "muted" }, TOOL[c.mode || "chat"]?.name)))) : null,
    h("p", { class: "foot-note" }, "Eva v4 · runs on your own computer or server · your chats stay with you"));

  host.replaceChildren(h("div", { class: "page home" }, hero, body));
  tree = new EvaTree(canvas, { topPad: innerWidth < 700 ? 200 : 170, ground: innerWidth < 700 ? 0.7 : 0.74 });
  return () => tree?.destroy();
}
