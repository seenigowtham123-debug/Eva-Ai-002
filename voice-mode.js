// Full-screen hands-free conversation with Eva: listen -> think -> speak -> listen again.
import { h } from "./ui.js";
import { EvaTree } from "./eva-tree.js";
import { YES, NO, runAction } from "./actions.js";
import { listen, speak, cancelSpeech, langOf, hasVoiceFor, supported } from "./voice.js";

const LABELS = {
  idle: "Tap the tree to talk · தொட்டுப் பேசுங்கள்",
  listening: "Listening · கேட்கிறேன்",
  thinking: "Thinking · யோசிக்கிறேன்",
  speaking: "Eva",
};

export function openVoiceMode({ getLang, ask, cancelAsk, toast, onClose }) {
  if (!supported.listen) { toast("Voice needs Chrome or Edge (speech recognition is not available in this browser).", "err"); return null; }
  const canvas = h("canvas", { class: "voice-canvas", "aria-hidden": "true" });
  const label = h("div", { class: "voice-label" });
  const caption = h("div", { class: "voice-caption", "aria-live": "polite" });
  const tap = h("button", { class: "voice-tap", type: "button", "aria-label": "Tap to interrupt or talk", onClick: onTap });
  const closeBtn = h("button", { class: "voice-close", type: "button", "aria-label": "Close voice mode", onClick: () => close() }, "✕");
  const root = h("div", { class: "voice", role: "dialog", "aria-modal": "true", "aria-label": "Eva voice mode" }, canvas, tap, label, caption, h("div", { class: "voice-hint" }, "Esc to close"), closeBtn);
  document.body.append(root);
  closeBtn.focus();

  const orb = new EvaTree(canvas, { topPad: 70, ground: 0.7 });
  const actionBox = h("div", { class: "voice-action", hidden: true });
  root.append(actionBox);
  let pending = null;
  const setPending = (a) => {
    pending = a || null;
    actionBox.hidden = !a;
    actionBox.replaceChildren(...(a ? [h("span", {}, a.label), h("button", { class: "btn primary sm", type: "button", onClick: () => { runAction(a); setPending(null); } }, "Do it · செய்"), h("button", { class: "btn sm", type: "button", onClick: () => setPending(null) }, "No")] : []));
  };
  let active = true, rec = null, tapResolve = null, skipSpeak = false, warned = false, state = "idle";
  const setState = (s) => { state = s; orb.setState(s); label.textContent = LABELS[s]; root.dataset.state = s; };
  const waitTap = () => new Promise((r) => { tapResolve = r; });

  function onTap() {
    if (state === "speaking") cancelSpeech();
    else if (state === "listening") rec?.stop();
    else if (state === "thinking") { skipSpeak = true; cancelAsk(); }
    else if (tapResolve) { const r = tapResolve; tapResolve = null; r(); }
  }
  const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); } };
  document.addEventListener("keydown", onKey, true);

  async function loop() {
    let empty = 0;
    while (active) {
      setState("listening"); caption.textContent = "";
      let text = "";
      try {
        rec = listen({ lang: getLang(), onInterim: (t) => { caption.textContent = t; }, onLevel: (v) => orb.setLevel(v) });
        text = await rec.done;
      } catch (e) { toast(e.message, "err"); break; }
      rec = null;
      if (!active) break;
      if (!text) {
        if (++empty >= 3) { empty = 0; setState("idle"); await waitTap(); }
        continue;
      }
      empty = 0; skipSpeak = false;
      caption.textContent = text;
      if (pending) {
        // The assistant proposed a phone action: "yes / ஆமா / சரி" confirms it, "no / வேண்டாம்" cancels, anything else is a new question.
        if (YES.test(text)) { runAction(pending); setPending(null); caption.textContent = "✓"; continue; }
        if (NO.test(text)) { setPending(null); continue; }
        setPending(null);
      }
      setState("thinking");
      const bot = await ask(text);
      if (!active) break;
      if (!bot?.content) { caption.textContent = bot?.error || ""; setState("idle"); await waitTap(); continue; }
      if (bot.action) setPending(bot.action);
      if (skipSpeak) continue;
      const lang = langOf(bot.content, getLang());
      if (!warned && !hasVoiceFor(lang)) { warned = true; toast(`No ${lang} voice is installed on this device, so Eva may stay silent. Microsoft Edge has Tamil voices.`, "err"); }
      setState("speaking"); caption.textContent = bot.content.replace(/[*#`>_]/g, "").slice(0, 400);
      await speak(bot.content, { lang, onPulse: () => orb.setLevel(0.85) });
    }
    if (active) close();
  }

  function close() {
    if (!active) return;
    active = false;
    rec?.stop(); cancelSpeech(); cancelAsk(); tapResolve?.(); setPending(null);
    document.removeEventListener("keydown", onKey, true);
    root.classList.add("out");
    setTimeout(() => { orb.destroy(); root.remove(); }, 250);
    onClose?.();
  }

  setState("idle");
  loop();
  return { close };
}
