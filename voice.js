// Speech in (SpeechRecognition) and speech out (speechSynthesis), using the browser's built-in engines.
// Chrome and Edge send microphone audio to their own speech service for recognition.
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const synth = window.speechSynthesis;

// Inside the Android app (a WebView) the browser speech engines do not exist, so the app's native
// plugins (speech-recognition and text-to-speech) are used instead. Same functions, same behaviour.
const nativePlugin = (name) => (window.Capacitor?.isNativePlatform?.() ? window.Capacitor.Plugins?.[name] : null);
export const supported = {
  get listen() { return Boolean(SR) || Boolean(nativePlugin("SpeechRecognition")); },
  get speak() { return Boolean(synth) || Boolean(nativePlugin("TextToSpeech")); },
};

export const VOICE_LANGS = [
  ["ta-IN", "தமிழ் (Tamil)"], ["en-IN", "English (India)"], ["en-US", "English (US)"], ["en-GB", "English (UK)"],
  ["hi-IN", "हिन्दी (Hindi)"], ["te-IN", "తెలుగు (Telugu)"], ["ml-IN", "മലയാളം (Malayalam)"], ["kn-IN", "ಕನ್ನಡ (Kannada)"],
];

/** Language to speak a piece of text in, judged by its script. */
export function langOf(text, fallback = "en-IN") {
  if (/[\u0B80-\u0BFF]/.test(text)) return "ta-IN";
  if (/[\u0900-\u097F]/.test(text)) return "hi-IN";
  if (/[\u0C00-\u0C7F]/.test(text)) return "te-IN";
  if (/[\u0D00-\u0D7F]/.test(text)) return "ml-IN";
  if (/[\u0C80-\u0CFF]/.test(text)) return "kn-IN";
  return /^ta|^hi|^te|^ml|^kn/.test(fallback) ? "en-IN" : fallback;
}

/** Markdown to plain, speakable text. */
export function toSpeech(md) {
  return String(md)
    .replace(/```[\s\S]*?```/g, " (code omitted) ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/[*_~>|]/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

let voices = [];
const loadVoices = () => { voices = synth?.getVoices() || []; };
if (synth) { loadVoices(); synth.addEventListener?.("voiceschanged", loadVoices); }

export function pickVoice(lang) {
  const l = lang.toLowerCase();
  const prefix = l.split("-")[0];
  const pool = voices.filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith(prefix));
  return pool.find((v) => v.lang.toLowerCase().replace("_", "-") === l && /natural|online/i.test(v.name)) ||
    pool.find((v) => v.lang.toLowerCase().replace("_", "-") === l) || pool[0] || null;
}
export const hasVoiceFor = (lang) => Boolean(pickVoice(lang));

function chunks(text, max = 180) {
  const parts = text.split(/(?<=[.!?।…])\s+/);
  const out = [];
  for (const p of parts) {
    let s = p;
    while (s.length > max) {
      let i = s.lastIndexOf(" ", max);
      if (i < 40) i = max;
      out.push(s.slice(0, i)); s = s.slice(i).trim();
    }
    if (s) out.push(s);
  }
  return out;
}

let speakToken = 0;
export function cancelSpeech() { speakToken++; synth?.cancel(); nativePlugin("TextToSpeech")?.stop?.().catch?.(() => {}); }

/** Speaks text; resolves when finished or cancelled. onPulse fires on word boundaries (for animation). */
export function speak(text, { lang = "en-IN", rate = 1, onPulse } = {}) {
  const plain = toSpeech(text);
  const tts = nativePlugin("TextToSpeech");
  if ((!synth && !tts) || !plain) return Promise.resolve();
  cancelSpeech();
  const token = speakToken;
  if (tts) {
    return (async () => {
      for (const part of chunks(plain)) {
        if (token !== speakToken) return;
        onPulse?.();
        try { await tts.speak({ text: part, lang, rate, pitch: 1, volume: 1, category: "playback" }); } catch { return; }
      }
    })();
  }
  const voice = pickVoice(lang);
  return new Promise((resolve) => {
    const queue = chunks(plain);
    const next = () => {
      if (token !== speakToken || !queue.length) return resolve();
      const u = new SpeechSynthesisUtterance(queue.shift());
      u.lang = voice?.lang || lang; u.rate = rate;
      if (voice) u.voice = voice;
      u.onboundary = () => onPulse?.();
      u.onend = next;
      u.onerror = () => (token === speakToken ? next() : resolve());
      synth.speak(u);
    };
    next();
  });
}

/**
 * Listens for one phrase. Returns { stop(), done: Promise<string> }.
 * onInterim(text) streams partial results; onLevel(0..1) is a rough activity signal.
 */
export function listen({ lang = "ta-IN", onInterim, onLevel } = {}) {
  const nat = nativePlugin("SpeechRecognition");
  if (!SR && nat) return nativeListen(nat, { lang, onInterim, onLevel });
  if (!SR) return { stop() {}, done: Promise.reject(new Error("Speech recognition is not supported in this browser. Use Chrome or Edge.")) };
  const rec = new SR();
  rec.lang = lang; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
  let finalText = "", interim = "", stopped = false;
  const done = new Promise((resolve, reject) => {
    rec.onresult = (e) => {
      interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t; else interim += t;
      }
      onInterim?.((finalText + interim).trim());
      onLevel?.(0.5 + Math.random() * 0.5);
    };
    rec.onspeechstart = () => onLevel?.(0.8);
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return resolve("");
      const msg = e.error === "not-allowed" || e.error === "service-not-allowed"
        ? "Microphone permission is blocked. Allow it in the address bar and try again."
        : e.error === "network" ? "Speech recognition needs an internet connection." : "Speech error: " + e.error;
      reject(new Error(msg));
    };
    rec.onend = () => resolve((finalText || interim).trim());
  });
  try { rec.start(); } catch (e) { return { stop() {}, done: Promise.reject(e) }; }
  return { stop() { if (!stopped) { stopped = true; try { rec.stop(); } catch { /* already stopped */ } } }, done };
}

function nativeListen(P, { lang, onInterim, onLevel }) {
  let text = "", finished = false, silence = 0, giveUp = 0;
  const handles = [];
  let resolveFn, rejectFn;
  const done = new Promise((res, rej) => { resolveFn = res; rejectFn = rej; });
  const finish = (err) => {
    if (finished) return;
    finished = true;
    clearTimeout(silence); clearTimeout(giveUp);
    handles.forEach((h) => h?.remove?.());
    Promise.resolve(P.stop?.()).catch(() => {});
    err ? rejectFn(err) : resolveFn(text.trim());
  };
  (async () => {
    try {
      const perm = await P.requestPermissions();
      if (perm?.speechRecognition && perm.speechRecognition !== "granted") return finish(new Error("Microphone permission is blocked. Allow it in the phone's app settings."));
      handles.push(await P.addListener("partialResults", (e) => {
        text = e?.matches?.[0] || e?.value?.[0] || text;
        onInterim?.(text); onLevel?.(0.5 + Math.random() * 0.5);
        clearTimeout(silence); silence = setTimeout(() => finish(), 1400);
      }));
      handles.push(await P.addListener("listeningState", (e) => { if (e?.status === "stopped") finish(); }));
      giveUp = setTimeout(() => finish(), 12000);
      await P.start({ language: lang, maxResults: 1, partialResults: true, popup: false });
    } catch (err) {
      finish(new Error(String(err?.message || err).includes("permission") ? "Microphone permission is blocked. Allow it in the phone's app settings." : "Speech recognition failed on this phone: " + (err?.message || err)));
    }
  })();
  return { stop: () => finish(), done };
}
