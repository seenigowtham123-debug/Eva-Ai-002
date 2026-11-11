// Shared state, settings and small helpers used by every page.
import { toast } from "./ui.js";

export const $ = (id) => document.getElementById(id);
export const mac = /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = mac ? "⌘" : "Ctrl+";
export const SETTINGS_KEY = "eva.settings";

const defaults = {
  brain: "auto", models: {}, language: "auto", temperature: null, systemPrompt: "", useKnowledge: true, useWeb: true,
  voiceLang: "ta-IN", speakReplies: false, theme: "dark", nav: true,
};

export const state = {
  settings: { ...defaults },
  config: null, // from /api/config
  server: null, // { base, health } once found
  online: false,
  convs: [],
  current: null, // { id, title, mode, messages: [{role, content, sources?, partial?, error?, thumbs?}] }
  streaming: false,
  abort: null,
  stick: true,
  voiceMode: null,
  dictation: null,
  forms: {}, // unsent tool-form values, per tool
  pending: [], // images attached to the next chat message
};
try { Object.assign(state.settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}")); } catch { /* ignore */ }

export const S = () => state.settings;
export function save() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); } catch { /* storage blocked */ }
}

// ---- tiny event bus so modules can talk without importing each other ----
const handlers = {};
export const bus = {
  on(name, fn) { (handlers[name] ||= []).push(fn); },
  emit(name, ...a) { for (const fn of handlers[name] || []) fn(...a); },
};

// ---- brains ----
export const BRAIN_LABEL = { auto: "Auto", builtin: "Built-in", gemini: "Gemini", claude: "Claude", ollama: "Ollama" };
/** The brain that will really answer: the chosen one, or what "auto" resolves to on the server. */
export const activeBrain = () => (S().brain && S().brain !== "auto" ? S().brain : state.config?.autoBrain || "builtin");
export const brainInfo = (id = activeBrain()) => state.config?.brains?.[id];
export const modelFor = (id = activeBrain()) => S().models[id] || brainInfo(id)?.model || "";
/** True when only the built-in (no AI model) brain is ready: the UI then nudges the user to connect one. */
export const hasRealBrain = () => ["claude", "gemini", "ollama"].some((b) => state.config?.brains?.[b]?.available);

// ---- theme ----
const mq = matchMedia("(prefers-color-scheme: dark)");
export function applyTheme() {
  const t = S().theme;
  const dark = t === "dark" || (t === "system" && mq.matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  bus.emit("theme");
}
mq.addEventListener("change", () => S().theme === "system" && applyTheme());
export function setTheme(t) { S().theme = t; save(); applyTheme(); }
export const toggleTheme = () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");

// ---- navigation (hash router: works from any static host, including VS Code Live Server) ----
export const go = (hash) => { if (location.hash === hash) bus.emit("route"); else location.hash = hash; };

export async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    if (btn) { const old = btn.innerHTML; btn.textContent = "✓"; setTimeout(() => (btn.innerHTML = old), 1200); }
  } catch { toast("Copy failed. Select the text manually.", "err"); }
}

export const greeting = () => {
  const hr = new Date().getHours();
  return hr < 5 ? "இனிய இரவு" : hr < 12 ? "காலை வணக்கம்" : hr < 17 ? "மதிய வணக்கம்" : hr < 21 ? "மாலை வணக்கம்" : "இனிய இரவு";
};
