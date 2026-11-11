// Eva's built-in brain: works with NO API key and NO Ollama, so the website is never dead.
// It is not a language model. It can do arithmetic, tell the time, quote your knowledge notes and
// Wikipedia/News results, and it explains how to connect a real AI brain (a free Gemini key takes one minute).

const TA = /[஀-௿]/;

// ---- safe arithmetic (recursive descent, no eval) ----
function calc(src) {
  const s = src.replace(/[×x]/gi, "*").replace(/÷/g, "/").replace(/\^/g, "**").replace(/,/g, "").replace(/\s+/g, "");
  if (!/^[\d.+\-*/%()]+$/.test(s) || !/\d/.test(s) || !/[+\-*/%]/.test(s.replace(/^-/, ""))) return null;
  let i = 0;
  const peek = () => s[i];
  function number() {
    const m = /^\d*\.?\d+/.exec(s.slice(i));
    if (!m) throw new Error("num");
    i += m[0].length;
    return parseFloat(m[0]);
  }
  function atom() {
    if (peek() === "(") {
      i++;
      const v = add();
      if (peek() !== ")") throw new Error("paren");
      i++;
      return v;
    }
    if (peek() === "-") { i++; return -atom(); }
    if (peek() === "+") { i++; return atom(); }
    return number();
  }
  function pow() {
    const base = atom();
    if (s.slice(i, i + 2) === "**") { i += 2; return Math.pow(base, pow()); }
    return base;
  }
  function mul() {
    let v = pow();
    while (peek() === "*" && s[i + 1] !== "*" || peek() === "/" || peek() === "%") {
      const op = s[i++];
      const r = pow();
      v = op === "*" ? v * r : op === "/" ? v / r : v % r;
    }
    return v;
  }
  function add() {
    let v = mul();
    while (peek() === "+" || peek() === "-") {
      const op = s[i++];
      const r = mul();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  try {
    const v = add();
    if (i !== s.length || !Number.isFinite(v)) return null;
    return Math.round(v * 1e10) / 1e10;
  } catch {
    return null;
  }
}

const STRINGS = {
  en: {
    hello: "Hello! I'm **Eva**. I'm running in **built-in mode** right now, so I can do maths, tell the time, search your knowledge notes and look things up on Wikipedia. For full AI answers (coding, images, long writing) connect a brain: open **Settings** and paste a free Gemini key.",
    who: "I'm **Eva**, your AI workspace. Right now I'm running my **built-in brain** (no key needed). Connect Gemini (free), Claude or Ollama in **Settings** to unlock full conversations.",
    answer: (v) => `**${v}**`,
    time: (d) => `It is **${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}** on **${d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}** (clock of the computer running Eva).`,
    kb: "From your knowledge notes",
    web: "From the web",
    needsAI: (mode) => `**${mode}** needs a real AI model, and none is connected yet. It takes about one minute and it is free (a Gemini key from Google):\n\n1. Open https://aistudio.google.com/apikey and create a key\n2. In Eva, open **Settings → Connect a brain** and paste it\n3. Come back here and ask again\n\nUntil then I can still do maths, show your knowledge notes and look things up on Wikipedia.`,
    nothing: "I don't have an answer for that in built-in mode. I only know your knowledge notes and what I can find on Wikipedia. To get full answers, open **Settings → Connect a brain** and paste a free Gemini key.",
    footer: "\n\n---\n*Built-in mode · no AI model connected · Settings → Connect a brain*",
  },
  ta: {
    hello: "வணக்கம்! நான் **ஈவா**. இப்போது **பில்ட்-இன் மோடில்** இருக்கிறேன்: கணக்கு போடுவேன், நேரம் சொல்வேன், உங்கள் நோட்ஸ் மற்றும் விக்கிப்பீடியாவில் தேடுவேன். முழு AI பதில்களுக்கு (கோடிங், படங்கள், நீண்ட எழுத்து) **Settings**-ல் இலவச Gemini key ஒட்டுங்கள்.",
    who: "நான் **ஈவா**, உங்கள் AI பணியிடம். இப்போது key தேவையில்லாத **பில்ட்-இன் மூளையில்** ஓடுகிறேன். முழு உரையாடலுக்கு **Settings**-ல் Gemini (இலவசம்), Claude அல்லது Ollama இணைக்கவும்.",
    answer: (v) => `**${v}**`,
    time: (d) => `இப்போது **${d.toLocaleTimeString("ta-IN", { hour: "2-digit", minute: "2-digit" })}**, **${d.toLocaleDateString("ta-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}** (Eva ஓடும் கணினியின் கடிகாரம்).`,
    kb: "உங்கள் நோட்ஸில் இருந்து",
    web: "இணையத்தில் இருந்து",
    needsAI: (mode) => `**${mode}** வேலைக்கு உண்மையான AI மாடல் வேண்டும்; இன்னும் எதுவும் இணைக்கப்படவில்லை. ஒரு நிமிடம்தான், இலவசம் (Google Gemini key):\n\n1. https://aistudio.google.com/apikey திறந்து key உருவாக்குங்கள்\n2. Eva-வில் **Settings → Connect a brain** சென்று ஒட்டுங்கள்\n3. திரும்ப வந்து கேளுங்கள்\n\nஅதுவரை கணக்கு, உங்கள் நோட்ஸ், விக்கிப்பீடியா தேடல் வேலை செய்யும்.`,
    nothing: "பில்ட்-இன் மோடில் இதற்கு என்னிடம் பதில் இல்லை. உங்கள் நோட்ஸ், விக்கிப்பீடியா மட்டுமே தெரியும். முழு பதில்களுக்கு **Settings → Connect a brain**-ல் இலவச Gemini key ஒட்டுங்கள்.",
    footer: "\n\n---\n*பில்ட்-இன் மோட் · AI மாடல் இணைக்கப்படவில்லை · Settings → Connect a brain*",
  },
};

const MODE_NAMES = { image: "Image Studio", code: "Coding help", solve: "Problem solving", debug: "Debugging", write: "Writing help", translate: "Translation", study: "Study help", chat: "Chat" };
const HELLO = /^(hi|hello|hey|hii+|yo|good (morning|afternoon|evening)|vanakkam|namaste)\b|^வணக்கம்|^ஹாய்|^ஹலோ/i;
const WHO = /\b(who are you|what are you|your name)\b|நீ யார்|உன் பெயர்|யார் நீ/i;
const TIME = /\b(what time|what'?s the (time|date)|what is the (time|date)|current time|time now|today'?s date|what day is it|what is today)\b|இப்போது (நேரம்|தேதி)|இன்று (தேதி|என்ன கிழமை)|நேரம் என்ன|தேதி என்ன/i;

/** Builds the full reply text (Markdown). `kb` = knowledge hits, `web` = web results. */
function buildReply({ messages, mode = "chat", kb = [], web = [], now = new Date() }) {
  const q = ([...messages].reverse().find((m) => m.role === "user")?.content || "").trim();
  const t = STRINGS[TA.test(q) ? "ta" : "en"];
  const tail = t.footer;

  if (HELLO.test(q) && q.length < 40) return t.hello + tail;
  if (WHO.test(q)) return t.who + tail;
  if (TIME.test(q)) return t.time(now) + tail;

  const expr = q.replace(/^(what('?s| is)|calculate|compute|solve|கணக்கிடு|கணக்கு)\s*/i, "").replace(/[=?]+\s*$/, "").trim();
  const v = calc(expr);
  if (v !== null) return `${expr} = ${t.answer(v)}` + tail;

  const parts = [];
  if (kb.length) parts.push(`**${t.kb}:**\n\n` + kb.slice(0, 2).map((h) => `> ${h.text.replace(/\s+/g, " ").slice(0, 500)}\n> *(${h.file})*`).join("\n\n"));
  if (web.length) parts.push(`**${t.web}:**\n\n` + web.slice(0, 2).map((w) => `**${w.title}**: ${(w.text || "").slice(0, 500)}${w.url ? ` ([${w.kind}](${w.url}))` : ""}`).join("\n\n"));
  if (parts.length) return parts.join("\n\n") + tail;
  if (mode !== "chat") return t.needsAI(MODE_NAMES[mode] || mode) + tail;
  return t.nothing + tail;
}

async function* streamBuiltin(_cfg, { messages, mode, kb, web, signal }) {
  const text = buildReply({ messages, mode, kb, web });
  // Stream it in small pieces so the UI behaves exactly like a real model.
  for (let i = 0; i < text.length; i += 6) {
    if (signal?.aborted) return;
    yield text.slice(i, i + 6);
    await new Promise((r) => setTimeout(r, 6));
  }
}

module.exports = { streamBuiltin, buildReply, calc };
