// Settings: brains, server connection, preferences.
import { api, getBase, useServer, forgetServer, discover, auth } from "./api.js";
import { icons } from "./icons.js";
import { h, toast, confirmDialog } from "./ui.js";
import { state, S, save, bus, setTheme, BRAIN_LABEL, activeBrain, modelFor } from "./core.js";
import { brainCards, reloadConfig } from "./connect.js";
import { VOICE_LANGS } from "./voice.js";
import { refreshConvs } from "./chat.js";

const section = (title, sub, ...kids) => h("section", { class: "set-sec" }, h("h2", {}, title), sub ? h("p", { class: "muted" }, sub) : null, ...kids);
const seg = (opts, cur, on) => h("div", { class: "seg" }, opts.map(([v, l]) => h("button", { type: "button", class: cur === v ? "on" : "", onClick: () => on(v) }, l)));

export function serverSteps() {
  return h("div", { class: "steps" },
    h("ol", {},
      h("li", {}, "Open the ", h("b", {}, "eva-ai"), " folder in VS Code (File → Open Folder)."),
      h("li", {}, "Open the terminal (Ctrl+` ) and run: ", h("code", {}, "node server.js")),
      h("li", {}, "Wait for ", h("code", {}, "Eva AI is running on http://localhost:3000"), ", then press Retry here."),
      h("li", {}, "Or just double-click ", h("code", {}, "start.bat"), " (Windows) / ", h("code", {}, "start.command"), " (Mac).")),
    h("p", { class: "muted" }, "Using VS Code “Go Live” is fine too: Eva finds the server on port 3000 by itself. Never open index.html by double-clicking the file."));
}

export function renderSettings(host) {
  const draw = () => {
    const base = getBase() || location.origin;
    const addr = h("input", { class: "input", value: state.online ? base : "", placeholder: "http://localhost:3000", "aria-label": "Server address", spellcheck: "false" });
    const status = h("span", { class: "chip " + (state.online ? "ok" : "err") }, state.online ? `Connected · v${state.server?.health?.version || "?"}` : "Not connected");
    const test = async () => {
      status.textContent = "Checking…"; status.className = "chip";
      const r = addr.value.trim() ? await useServer(addr.value.trim()) : await discover();
      if (r) { state.server = r; state.online = true; await reloadConfig(); toast("Connected."); bus.emit("online"); }
      else { state.online = false; toast("No Eva server answered at that address.", "err"); bus.emit("online"); }
      draw();
    };
    const pref = (label, ctrl) => h("label", { class: "pref" }, h("span", {}, label), ctrl);
    const models = state.config?.brains?.[activeBrain()]?.models || [];
    const el = h("div", { class: "page plain settings" },
      h("header", { class: "plain-head" }, h("h1", {}, "Settings", h("span", { class: "ta" }, "அமைப்புகள்")), h("p", { class: "muted" }, "Connect a brain, check the server, tune Eva.")),
      section("Connect a brain", "Pick which AI answers. Auto uses the best one that is ready.",
        seg([["auto", "Auto"], ["gemini", "Gemini"], ["claude", "Claude"], ["ollama", "Ollama"], ["builtin", "Built-in"]], S().brain, (v) => { S().brain = v; save(); bus.emit("brain"); draw(); }),
        h("p", { class: "muted" }, "Answering now: ", h("b", {}, BRAIN_LABEL[activeBrain()] || activeBrain()), modelFor() ? " · " + modelFor() : ""),
        state.online ? brainCards() : h("p", { class: "muted" }, "Connect to the server first (below).")),
      section("Server connection", "This page talks to the Eva server. It looks for it by itself.",
        h("div", { class: "row" }, status, h("span", { class: "muted" }, state.online ? base : "")),
        h("div", { class: "key-row" }, addr, h("button", { class: "btn primary sm", type: "button", onClick: test }, "Test / connect"), h("button", { class: "btn sm", type: "button", onClick: () => { forgetServer(); addr.value = ""; test(); } }, "Find automatically")),
        h("details", { open: !state.online }, h("summary", {}, "Server not starting? Steps"), serverSteps())),
      section("Preferences", null,
        pref("Theme", seg([["dark", "Night"], ["light", "Day"], ["system", "System"]], S().theme, (v) => { setTheme(v); draw(); })),
        models.length > 1 ? pref("Model", h("select", { class: "input", onChange: (e) => { S().models[activeBrain()] = e.target.value; save(); } }, models.map((m) => h("option", { value: m, selected: modelFor() === m }, m)))) : null,
        pref("Reply language", h("select", { class: "input", onChange: (e) => { S().language = e.target.value; save(); } }, ["auto", ...(state.config?.languages || [])].map((l) => h("option", { value: l, selected: S().language === l }, l === "auto" ? "Same as my message" : l)))),
        pref("Voice language", h("select", { class: "input", onChange: (e) => { S().voiceLang = e.target.value; save(); } }, VOICE_LANGS.map(([code, name]) => h("option", { value: code, selected: S().voiceLang === code }, name)))),
        pref("Read replies aloud", h("input", { type: "checkbox", checked: S().speakReplies, onChange: (e) => { S().speakReplies = e.target.checked; save(); } })),
        pref("Creativity", h("input", { type: "range", min: "0", max: "1", step: "0.1", value: String(S().temperature ?? 0.7), onChange: (e) => { S().temperature = +e.target.value; save(); } })),
        h("label", { class: "pref col" }, h("span", {}, "Custom instructions"), h("textarea", { class: "input", rows: "3", placeholder: "e.g. Always answer in Tamil. Keep answers short.", value: S().systemPrompt, onInput: (e) => { S().systemPrompt = e.target.value.slice(0, 2000); save(); } }))),
      section("Data", null, h("div", { class: "row" },
        h("button", { class: "btn danger sm", type: "button", onClick: async () => { if (await confirmDialog("Delete all chats?", "This cannot be undone.", "Delete all", true)) { await api.deleteAllConversations(); state.current = null; await refreshConvs(); toast("All chats deleted."); } } }, "Delete all chats"),
        auth.get() ? h("button", { class: "btn sm", type: "button", onClick: () => { auth.set(""); location.reload(); } }, "Lock (forget password)") : null)));
    host.replaceChildren(el);
  };
  draw();
  redraw = () => document.querySelector(".page.settings") && draw();
  return () => { redraw = null; };
}
let redraw = null;
bus.on("config", () => redraw?.());
