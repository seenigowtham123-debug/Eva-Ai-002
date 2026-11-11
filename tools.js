// The tool pages. Each one is data: a heading, form fields, starter examples, and a build() that turns
// the form into the message sent to the server together with the page's `mode`.
// Field types: seg (buttons), select, text (textarea), images (drop / paste / pick).

const LANGS_COMMON = ["Python", "JavaScript", "TypeScript", "Java", "C", "C++", "C#", "Go", "Rust", "PHP", "Kotlin", "Swift", "SQL", "HTML/CSS", "Bash", "R", "Dart"];
const fence = (code, lang = "") => "```" + lang + "\n" + code.trim() + "\n```";
const clip = (s, n = 60) => s.replace(/\s+/g, " ").trim().slice(0, n);

export const TOOLS = [
  {
    id: "chat", name: "New chat", ta: "புதிய உரையாடல்", tag: "Ask anything, in any language", icon: "chat", hue: 175,
    desc: "Talk with Eva in Tamil, English or any mix. She answers in your language and can use your notes and live web results.",
    placeholder: "Message Eva…  (Tamil, English or Tanglish)",
    fields: [],
    examples: [
      { label: "Explain how a neural network learns, in simple Tamil", text: "Explain how a neural network learns, in simple Tamil" },
      { label: "Give me a 7-day plan to learn Python", text: "Give me a 7-day plan to learn Python from zero" },
      { label: "இன்று என்ன செய்தி?", text: "இன்றைய முக்கிய செய்திகள் என்ன?" },
      { label: "Summarize my knowledge notes", text: "Summarize what is in my knowledge notes" },
    ],
    build: (v) => ({ message: v.prompt, title: clip(v.prompt) }),
  },
  {
    id: "image", name: "Image Studio", ta: "படங்கள்", tag: "Understand photos, create art", icon: "image", hue: 305,
    desc: "Drop a photo, screenshot, bill or chart and ask anything about it. Or describe a picture and Eva draws it as scalable SVG art you can download.",
    fields: [
      { type: "seg", key: "task", options: [["analyze", "Analyze an image"], ["create", "Create art (SVG)"]], def: "analyze" },
      { type: "images", key: "images", showIf: (v) => v.task === "analyze", hint: "You can also paste with Ctrl+V. PNG, JPG, WebP, GIF, up to 4 images." },
      { type: "select", key: "style", label: "Art style", options: ["Flat vector", "Neon glow", "Watercolor look", "Minimal line art", "Isometric 3D", "Paper cut", "Pixel art"], def: "Flat vector", showIf: (v) => v.task === "create" },
      { type: "text", key: "prompt", label: "What should Eva do?", rows: 3, placeholder: "e.g. What does this chart say?  /  Read the text in this photo  /  A glowing tree at night with fireflies" },
    ],
    examples: [
      { label: "Read the text in my image", set: { task: "analyze", prompt: "Read all the text in this image and give it to me as clean text. If it is not English, also translate it." } },
      { label: "Explain this chart", set: { task: "analyze", prompt: "Explain what this chart or screenshot shows, the key numbers, and what I should notice." } },
      { label: "Draw a glowing tree", set: { task: "create", prompt: "A giant glowing willow tree at night with floating fireflies and a calm lake reflection" } },
      { label: "Logo idea for my project", set: { task: "create", style: "Minimal line art", prompt: "A simple modern logo for an AI assistant called Eva, with a small tree and a spark" } },
    ],
    build: (v) => {
      if (v.task === "create") {
        const p = v.prompt.trim();
        return { message: `Create an image in the style "${v.style}": ${p}\n\nReturn it as one complete SVG.`, title: "Art: " + clip(p, 50) };
      }
      const p = v.prompt.trim() || "Describe this image in detail, and read any text that appears in it.";
      return { message: p, title: "Image: " + clip(p, 50), images: v.images };
    },
    validate: (v) => (v.task === "analyze" ? (v.images?.length ? "" : "Add at least one image to analyze.") : v.prompt.trim() ? "" : "Describe the picture you want."),
  },
  {
    id: "code", name: "Coding", ta: "கோடிங்", tag: "Write, explain, review and convert code", icon: "code", hue: 205,
    desc: "A pair-programmer that writes working code, explains it line by line, reviews it for bugs and security, converts between languages and writes tests.",
    fields: [
      { type: "seg", key: "task", options: [["write", "Write code"], ["explain", "Explain code"], ["review", "Review"], ["convert", "Convert"], ["tests", "Write tests"]], def: "write" },
      { type: "select", key: "lang", label: "Language", options: ["Auto-detect", ...LANGS_COMMON], def: "Auto-detect" },
      { type: "text", key: "prompt", label: "Describe what you need, or paste your code", rows: 8, mono: true, placeholder: "e.g. A function that removes duplicates from a list, keeping the order" },
    ],
    examples: [
      { label: "Todo app in JavaScript", set: { task: "write", lang: "JavaScript", prompt: "A small todo list web page with add, delete, mark done, and saving in localStorage. One HTML file." } },
      { label: "Python: read a CSV and chart it", set: { task: "write", lang: "Python", prompt: "Read sales.csv with columns date and amount, then plot monthly totals as a bar chart." } },
      { label: "Explain this regex", set: { task: "explain", lang: "Auto-detect", prompt: "^(?=.*[A-Z])(?=.*\\d)[A-Za-z\\d]{8,}$" } },
      { label: "SQL: top 5 customers", set: { task: "write", lang: "SQL", prompt: "Top 5 customers by total order amount in the last 30 days. Tables: customers(id,name), orders(id,customer_id,amount,created_at)." } },
    ],
    build: (v) => {
      const verbs = { write: "Write code for this", explain: "Explain this code step by step, in simple words", review: "Review this code for bugs, security issues, performance and style, then give an improved version", convert: "Convert this code (ask me nothing; target language is the one selected, or the most sensible one)", tests: "Write thorough unit tests for this code" };
      const lang = v.lang && v.lang !== "Auto-detect" ? `\nLanguage: ${v.lang}` : "";
      return { message: `${verbs[v.task]}.${lang}\n\n${v.prompt.trim()}`, title: `${v.task === "write" ? "Code" : v.task}: ${clip(v.prompt, 45)}` };
    },
  },
  {
    id: "solve", name: "Problem solving", ta: "கணக்கு & தீர்வு", tag: "Maths, logic, science and decisions", icon: "solve", hue: 45,
    desc: "Hard question? Eva works through it step by step, checks the answer a second way, and gives a clear final result. Also good for planning and choosing between options.",
    fields: [
      { type: "seg", key: "kind", options: [["math", "Maths"], ["logic", "Logic & puzzles"], ["science", "Science"], ["decide", "Plan / Decide"], ["other", "Other"]], def: "math" },
      { type: "seg", key: "detail", options: [["steps", "Full steps"], ["short", "Short answer"]], def: "steps" },
      { type: "text", key: "prompt", label: "Type or paste the problem", rows: 6, placeholder: "e.g. A train leaves at 9:00 at 60 km/h. Another leaves the same station at 10:00 at 80 km/h. When does the second catch up?" },
    ],
    examples: [
      { label: "Two trains problem", set: { kind: "math", prompt: "A train leaves at 9:00 at 60 km/h. Another leaves the same station at 10:00 at 80 km/h. When does the second catch up with the first?" } },
      { label: "Solve x² − 5x + 6 = 0", set: { kind: "math", prompt: "Solve x^2 - 5x + 6 = 0 and explain the method." } },
      { label: "Which laptop should I buy?", set: { kind: "decide", prompt: "I need a laptop for coding and light video editing, budget about 70,000 rupees. Compare options and recommend one." } },
      { label: "Knights and knaves", set: { kind: "logic", prompt: "A says: B is a liar. B says: A and I are the same type. Who is a knight and who is a knave?" } },
    ],
    build: (v) => {
      const kinds = { math: "Maths problem", logic: "Logic puzzle", science: "Science question", decide: "Planning or decision problem", other: "Problem" };
      return { message: `${kinds[v.kind]} (${v.detail === "steps" ? "show every step and verify the result" : "give the answer with only a brief justification"}):\n\n${v.prompt.trim()}`, title: "Solve: " + clip(v.prompt, 48) };
    },
  },
  {
    id: "debug", name: "Debugging", ta: "பிழை திருத்தம்", tag: "Paste the error, get the fix", icon: "bug", hue: 12,
    desc: "Paste your broken code and the error message. Eva finds the root cause, shows the corrected code and explains how to avoid it next time.",
    fields: [
      { type: "select", key: "lang", label: "Language", options: ["Auto-detect", ...LANGS_COMMON], def: "Auto-detect" },
      { type: "text", key: "code", label: "Your code", rows: 9, mono: true, placeholder: "Paste the code that does not work", required: true },
      { type: "text", key: "error", label: "Error message or what goes wrong", rows: 4, mono: true, placeholder: "Paste the full error / stack trace, or describe the wrong behaviour" },
      { type: "text", key: "expected", label: "What should happen? (optional)", rows: 2, placeholder: "e.g. It should print the sum of the list" },
    ],
    examples: [
      { label: "Python TypeError", set: { lang: "Python", code: "nums = [1, 2, 3]\ntotal = 0\nfor i in range(nums):\n    total += nums[i]\nprint(total)", error: "TypeError: 'list' object cannot be interpreted as an integer", expected: "Print 6" } },
      { label: "JavaScript undefined", set: { lang: "JavaScript", code: "const user = { name: 'Eva' };\nconsole.log(user.profile.age);", error: "TypeError: Cannot read properties of undefined (reading 'age')" } },
      { label: "Node: port already used", set: { lang: "Bash", code: "node server.js", error: "Error: listen EADDRINUSE: address already in use :::3000" } },
    ],
    build: (v) => {
      const lang = v.lang && v.lang !== "Auto-detect" ? v.lang : "";
      let m = `Debug this${lang ? " " + lang : ""} code.\n\n**Code:**\n${fence(v.code, lang.toLowerCase())}`;
      if (v.error.trim()) m += `\n\n**Error / problem:**\n${fence(v.error)}`;
      if (v.expected.trim()) m += `\n\n**Expected behaviour:** ${v.expected.trim()}`;
      return { message: m, title: "Debug: " + clip(v.error || v.code, 48) };
    },
    validate: (v) => (v.code.trim() ? "" : "Paste the code first."),
  },
  {
    id: "write", name: "Writing", ta: "எழுத்து உதவி", tag: "Emails, essays, posts and rewriting", icon: "pen", hue: 150,
    desc: "Draft or polish anything: emails, letters, essays, social posts, summaries. Pick the tone and length, and Eva gives you text ready to copy.",
    fields: [
      { type: "seg", key: "kind", options: [["email", "Email"], ["letter", "Letter"], ["essay", "Essay"], ["post", "Social post"], ["summary", "Summary"], ["rewrite", "Rewrite"]], def: "email" },
      { type: "select", key: "tone", label: "Tone", options: ["Friendly", "Professional", "Formal", "Persuasive", "Casual", "Polite and firm", "Inspiring"], def: "Professional" },
      { type: "select", key: "length", label: "Length", options: ["Short", "Medium", "Long"], def: "Medium" },
      { type: "select", key: "outLang", label: "Write in", options: ["Same as my input", "English", "Tamil", "Hindi", "Telugu", "Malayalam", "Kannada"], def: "Same as my input" },
      { type: "text", key: "prompt", label: "What should it say? (or paste text to rewrite or summarize)", rows: 7, placeholder: "e.g. Leave request for Friday because of a family function" },
    ],
    examples: [
      { label: "Leave request email", set: { kind: "email", tone: "Polite and firm", length: "Short", prompt: "Leave request to my manager for Friday, family function. I will finish pending work before Thursday." } },
      { label: "Internship application", set: { kind: "letter", tone: "Formal", length: "Medium", prompt: "Cover letter for a software internship. I am a final-year CSE student who built a self-hosted AI chat project." } },
      { label: "LinkedIn post", set: { kind: "post", tone: "Inspiring", length: "Short", prompt: "I finished my final-year project: an AI workspace with voice, image and code tools." } },
    ],
    build: (v) => {
      const kinds = { email: "an email", letter: "a letter", essay: "an essay", post: "a social media post", summary: "a summary", rewrite: "a polished rewrite" };
      const lang = v.outLang !== "Same as my input" ? ` Write it in ${v.outLang}.` : "";
      return { message: `Write ${kinds[v.kind]}. Tone: ${v.tone}. Length: ${v.length}.${lang}\n\n${v.prompt.trim()}`, title: `${v.kind}: ${clip(v.prompt, 45)}` };
    },
  },
  {
    id: "translate", name: "Translate", ta: "மொழிபெயர்ப்பு", tag: "132 languages, natural tone", icon: "translate", hue: 265,
    desc: "Translate text between Tamil, English, Hindi and more than a hundred other languages, with romanised pronunciation and notes on tone.",
    fields: [
      { type: "select", key: "from", label: "From", options: ["Auto-detect"], def: "Auto-detect", langs: true },
      { type: "select", key: "to", label: "To", options: ["Tamil"], def: "Tamil", langs: true, noAuto: true },
      { type: "text", key: "prompt", label: "Text to translate", rows: 7, placeholder: "Type or paste your text" },
    ],
    examples: [
      { label: "Good morning, how are you?", set: { from: "English", to: "Tamil", prompt: "Good morning, how are you? I hope your day goes well." } },
      { label: "வணக்கம், உங்களை சந்திக்க மகிழ்ச்சி", set: { from: "Tamil", to: "English", prompt: "வணக்கம், உங்களை சந்திக்க மிகவும் மகிழ்ச்சி." } },
      { label: "Hindi to Tamil", set: { from: "Hindi", to: "Tamil", prompt: "आप कैसे हैं? मैं यहाँ नया हूँ।" } },
    ],
    build: (v) => ({ message: `Translate${v.from !== "Auto-detect" ? " from " + v.from : ""} into ${v.to}:\n\n${v.prompt.trim()}`, title: `${v.to}: ${clip(v.prompt, 45)}` }),
  },
  {
    id: "study", name: "Study help", ta: "படிப்பு உதவி", tag: "Learn, revise and test yourself", icon: "study", hue: 120,
    desc: "Learn any topic at your level: simple explanations with analogies, quick revision notes, quizzes, flashcards or a study plan for your exam date.",
    fields: [
      { type: "seg", key: "action", options: [["explain", "Explain"], ["notes", "Revision notes"], ["quiz", "Quiz me"], ["cards", "Flashcards"], ["plan", "Study plan"]], def: "explain" },
      { type: "select", key: "level", label: "My level", options: ["School (class 6-10)", "Higher secondary", "College / Engineering", "Beginner", "Advanced"], def: "College / Engineering" },
      { type: "text", key: "prompt", label: "Topic or question", rows: 5, placeholder: "e.g. How does TCP three-way handshake work?" },
    ],
    examples: [
      { label: "Explain recursion", set: { action: "explain", prompt: "Recursion in programming" } },
      { label: "DBMS normalization notes", set: { action: "notes", prompt: "Database normalization: 1NF, 2NF, 3NF, BCNF with examples" } },
      { label: "Quiz: Operating systems", set: { action: "quiz", prompt: "Operating systems: processes, threads, scheduling, deadlocks" } },
      { label: "2-week plan for DSA", set: { action: "plan", prompt: "Data structures and algorithms. Exam in 14 days, 3 hours per day." } },
    ],
    build: (v) => {
      const acts = { explain: "Explain", notes: "Make concise revision notes on", quiz: "Quiz me with 8 questions (mixed difficulty, answers at the end) on", cards: "Make 12 flashcards (Q and A) on", plan: "Make a day-by-day study plan for" };
      return { message: `${acts[v.action]}: ${v.prompt.trim()}\n\nMy level: ${v.level}.`, title: `${v.action}: ${clip(v.prompt, 45)}` };
    },
  },
];

export const TOOL = Object.fromEntries(TOOLS.map((t) => [t.id, t]));

/** Default form values for a tool. */
export function defaults(tool) {
  const v = { prompt: "" };
  for (const f of tool.fields) if (f.type !== "images") v[f.key] = f.def ?? "";
  v.images = [];
  return v;
}
