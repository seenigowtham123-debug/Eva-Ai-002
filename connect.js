// "Connect a brain" cards, used on the home page and in Settings.
import { api } from "./api.js";
import { icons } from "./icons.js";
import { h, toast } from "./ui.js";
import { state, S, save, bus, BRAIN_LABEL } from "./core.js";

export async function reloadConfig() {
  try { state.config = await api.config(); bus.emit("config"); } catch { /* offline */ }
}

async function saveAndTest(field, brain, input, status, btn) {
  const key = input.value.trim();
  if (!key) { toast("Paste the key first.", "err"); input.focus(); return; }
  btn.disabled = true; status.textContent = "Saving…"; status.className = "chip";
  try {
    await api.setup({ [field]: key });
    await reloadConfig();
    status.textContent = "Testing…";
    const r = await api.testBrain(brain);
    if (r.ok) {
      S().brain = "auto"; save();
      status.textContent = "Connected ✓"; status.className = "chip ok";
      toast(BRAIN_LABEL[brain] + " is connected. Eva will use it now.");
      input.value = "";
      bus.emit("brain");
    } else {
      status.textContent = r.error; status.className = "chip err";
    }
  } catch (e) {
    status.textContent = e.status === 403 ? "Saving from the browser only works on the computer that runs Eva. Put the key in the .env file instead." : e.message;
    status.className = "chip err";
  } finally { btn.disabled = false; }
}

function keyCard({ id, field, title, badge, blurb, link, linkLabel, placeholder }) {
  const info = state.config?.brains?.[id];
  const on = Boolean(info?.available);
  const input = h("input", { class: "input", type: "password", placeholder, autocomplete: "off", spellcheck: "false", "aria-label": title + " API key" });
  const status = h("span", { class: "chip" + (on ? " ok" : "") }, on ? "Connected ✓" : "Not connected");
  const btn = h("button", { class: "btn primary sm", type: "button" }, on ? "Replace key" : "Save & test");
  btn.addEventListener("click", () => saveAndTest(field, id, input, status, btn));
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); btn.click(); } });
  const testBtn = on ? h("button", { class: "btn sm", type: "button", onClick: async (e) => {
    e.currentTarget.disabled = true; status.textContent = "Testing…";
    const r = await api.testBrain(id).catch((x) => ({ ok: false, error: x.message }));
    status.textContent = r.ok ? "Works ✓" : r.error; status.className = "chip " + (r.ok ? "ok" : "err");
    e.currentTarget.disabled = false;
  } }, "Test") : null;
  return h("div", { class: "brain-card" + (on ? " on" : "") },
    h("div", { class: "row between" }, h("b", {}, title), badge ? h("span", { class: "chip accent" }, badge) : null),
    h("p", {}, blurb),
    h("a", { href: link, target: "_blank", rel: "noopener noreferrer", class: "link" }, linkLabel, " ", h("span", { html: icons.arrow })),
    h("div", { class: "key-row" }, input, btn, testBtn),
    status);
}

export function brainCards({ only } = {}) {
  const cfg = state.config;
  const ol = cfg?.brains?.ollama;
  const cards = {
    builtin: h("div", { class: "brain-card on" },
      h("div", { class: "row between" }, h("b", {}, "Built-in"), h("span", { class: "chip ok" }, "Always on")),
      h("p", {}, "Needs nothing. Does maths, tells the time, searches your notes and Wikipedia. Not a full AI, so coding, images and long writing need one of the brains below.")),
    gemini: keyCard({ id: "gemini", field: "geminiKey", title: "Google Gemini", badge: "Free · recommended", blurb: "A real AI with a free tier. Sign in with a Google account, press “Create API key”, copy it here. Works for chat, code, images and Tamil.", link: "https://aistudio.google.com/apikey", linkLabel: "Get a free key", placeholder: "Paste Gemini key (starts with AIza…)" }),
    claude: keyCard({ id: "claude", field: "anthropicKey", title: "Claude (Anthropic)", badge: "Best quality · paid", blurb: "Highest quality answers and image understanding. Needs an API key with credit from the Anthropic console.", link: "https://console.anthropic.com/settings/keys", linkLabel: "Open the console", placeholder: "Paste Claude key (sk-ant-…)" }),
    ollama: h("div", { class: "brain-card" + (ol?.available ? " on" : "") },
      h("div", { class: "row between" }, h("b", {}, "Ollama (offline)"), h("span", { class: "chip" + (ol?.available ? " ok" : "") }, ol?.available ? "Running ✓" : "Not running")),
      h("p", {}, "Free models that run on your own computer, no internet and no key. Install Ollama, then run ", h("code", {}, "ollama pull llama3.1"), ". Eva finds it by itself."),
      h("a", { href: "https://ollama.com/download", target: "_blank", rel: "noopener noreferrer", class: "link" }, "Download Ollama ", h("span", { html: icons.arrow }))),
  };
  return h("div", { class: "brain-grid" + (only?.length === 1 ? " single" : "") }, (only || Object.keys(cards)).map((k) => cards[k]));
}
