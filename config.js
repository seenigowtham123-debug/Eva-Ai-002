const path = require("path");
const { loadEnv } = require("./env");

const root = path.join(__dirname, "..");
loadEnv(path.join(root, ".env"));
const int = (v, d) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d);

const BRAINS = ["claude", "gemini", "ollama", "builtin"];
const wanted = (process.env.BRAIN || "auto").toLowerCase();

module.exports = {
  root,
  envFile: path.join(root, ".env"),
  port: int(process.env.PORT, 3000),
  // "auto" picks the best brain that is ready: Claude, then Gemini, then Ollama, then the built-in one (no key needed).
  defaultBrain: BRAINS.includes(wanted) ? wanted : "auto",
  anthropicKey: process.env.ANTHROPIC_API_KEY || "",
  anthropicUrl: (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/$/, ""),
  claudeModel: process.env.CLAUDE_MODEL || "claude-sonnet-5-5",
  // Extra models offered in the Settings menu (comma separated).
  // Free option: a Gemini API key from https://aistudio.google.com/apikey
  geminiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_KEY || "",
  geminiUrl: (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com").replace(/\/$/, ""),
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  geminiModels: (process.env.GEMINI_MODELS || "").split(",").map((s) => s.trim()).filter(Boolean),
  claudeModels: (process.env.CLAUDE_MODELS || "").split(",").map((s) => s.trim()).filter(Boolean),
  ollamaUrl: (process.env.OLLAMA_URL || "http://localhost:11434").replace(/\/$/, ""),
  ollamaModel: process.env.OLLAMA_MODEL || "llama3.1",
  maxTokens: int(process.env.MAX_TOKENS, 4096),
  historyLimit: int(process.env.HISTORY_LIMIT, 30),
  // Optional shared password. Strongly recommended for any public deployment.
  accessToken: process.env.ACCESS_TOKEN || "",
  dataDir: path.resolve(root, process.env.DATA_DIR || "data"),
  knowledgeDir: path.resolve(root, process.env.KNOWLEDGE_DIR || "knowledge"),
  chatRatePerMin: int(process.env.CHAT_RATE_PER_MIN, 30),
  apiRatePerMin: int(process.env.API_RATE_PER_MIN, 300),
  corsOrigin: process.env.CORS_ORIGIN || "",
  // Live web lookups (Wikipedia, Google News RSS; Google Custom Search when both keys are set).
  webSearch: (process.env.WEB_SEARCH || "on").toLowerCase() !== "off",
  googleKey: process.env.GOOGLE_API_KEY || "",
  googleCx: process.env.GOOGLE_CSE_ID || "",
  trustProxy: process.env.TRUST_PROXY ? int(process.env.TRUST_PROXY, 1) : 1,
};
