// Minimal .env loader (no dependency). Existing environment variables win.
const fs = require("fs");

function loadEnv(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!(key in process.env)) process.env[key] = val;
  }
}

// Insert or replace KEY=value in a .env file (creates it if missing). Values are kept on one line.
function setEnvVar(file, key, value) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new Error("Bad key name");
  const clean = String(value).replace(/[\r\n]/g, "").trim();
  let lines = [];
  try {
    lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  } catch { /* new file */ }
  const re = new RegExp("^\\s*" + key + "\\s*=");
  const at = lines.findIndex((l) => re.test(l));
  const line = `${key}=${clean}`;
  if (at >= 0) lines[at] = line;
  else {
    while (lines.length && lines[lines.length - 1] === "") lines.pop();
    lines.push(line);
  }
  fs.writeFileSync(file, lines.join("\n") + "\n", { mode: 0o600 });
}

module.exports = { loadEnv, setEnvVar };
