// The two "brains". Both are async generators that yield text deltas.

async function* readLines(body, signal) {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      if (signal?.aborted) return;
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        yield buf.slice(0, i).replace(/\r$/, "");
        buf = buf.slice(i + 1);
      }
    }
    if (buf.trim()) yield buf;
  } finally {
    reader.cancel().catch(() => {});
  }
}

// Images (if any) are attached to the last user message: [{ mime, data(base64) }].
const withImages = (messages, images, wrap) => {
  if (!images?.length) return messages;
  const out = messages.map((m) => ({ ...m }));
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].role === "user") {
      out[i] = wrap(out[i], images);
      break;
    }
  }
  return out;
};

async function* streamClaude(cfg, { messages, system, model, temperature, signal, images }) {
  if (!cfg.anthropicKey) throw new Error("ANTHROPIC_API_KEY is not set on the server. Add it in Settings, or use the free Gemini / built-in brain.");
  const msgs = withImages(messages, images, (m, imgs) => ({
    role: "user",
    content: [...imgs.map((im) => ({ type: "image", source: { type: "base64", media_type: im.mime, data: im.data } })), { type: "text", text: m.content || "Describe this image." }],
  }));
  const body = { model: model || cfg.claudeModel, max_tokens: cfg.maxTokens, system, messages: msgs, stream: true };
  if (typeof temperature === "number") body.temperature = temperature;
  const r = await fetch(`${cfg.anthropicUrl}/v1/messages`, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", "x-api-key": cfg.anthropicKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    let msg = `Claude API error (${r.status})`;
    try {
      msg = (await r.json())?.error?.message || msg;
    } catch { /* keep default */ }
    throw new Error(msg);
  }
  for await (const line of readLines(r.body, signal)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    let ev;
    try {
      ev = JSON.parse(payload);
    } catch {
      continue;
    }
    if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") yield ev.delta.text;
    else if (ev.type === "error") throw new Error(ev.error?.message || "Claude stream error");
  }
}

async function* streamOllama(cfg, { messages, system, model, temperature, signal, images }) {
  const msgs = withImages(messages, images, (m, imgs) => ({ ...m, content: m.content || "Describe this image.", images: imgs.map((im) => im.data) }));
  let r;
  try {
    r = await fetch(`${cfg.ollamaUrl}/api/chat`, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: model || cfg.ollamaModel,
        stream: true,
        options: typeof temperature === "number" ? { temperature } : undefined,
        messages: [{ role: "system", content: system }, ...msgs],
      }),
    });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new Error("Cannot reach Ollama at " + cfg.ollamaUrl + ". Start it with 'ollama serve' and pull the model first.");
  }
  if (!r.ok) {
    let msg = `Ollama error (${r.status}). Is the model "${model || cfg.ollamaModel}" downloaded?`;
    try {
      msg = (await r.json())?.error || msg;
    } catch { /* keep default */ }
    throw new Error(msg);
  }
  for await (const line of readLines(r.body, signal)) {
    if (!line.trim()) continue;
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    if (ev.error) throw new Error(ev.error);
    if (ev.message?.content) yield ev.message.content;
  }
}

async function listOllamaModels(cfg) {
  try {
    const r = await fetch(`${cfg.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(1500) });
    if (!r.ok) return null;
    return ((await r.json()).models || []).map((m) => m.name);
  } catch {
    return null;
  }
}

async function* streamGemini(cfg, { messages, system, model, temperature, signal, images }) {
  if (!cfg.geminiKey) throw new Error("No Gemini key yet. Get a free one at https://aistudio.google.com/apikey and paste it in Settings.");
  const name = (model || cfg.geminiModel).replace(/^models\//, "");
  const contents = messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content || " " }] }));
  if (images?.length) {
    for (let i = contents.length - 1; i >= 0; i--) {
      if (contents[i].role === "user") {
        if (contents[i].parts[0].text.trim() === "") contents[i].parts[0].text = "Describe this image.";
        contents[i].parts.unshift(...images.map((im) => ({ inlineData: { mimeType: im.mime, data: im.data } })));
        break;
      }
    }
  }
  const body = { systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { maxOutputTokens: cfg.maxTokens } };
  if (typeof temperature === "number") body.generationConfig.temperature = temperature;
  let r;
  try {
    r = await fetch(`${cfg.geminiUrl}/v1beta/models/${encodeURIComponent(name)}:streamGenerateContent?alt=sse`, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", "x-goog-api-key": cfg.geminiKey },
      body: JSON.stringify(body),
    });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new Error("Cannot reach Google's Gemini service. Check the internet connection of the computer running Eva.");
  }
  if (!r.ok) {
    let msg = `Gemini error (${r.status})`;
    try {
      msg = (await r.json())?.error?.message || msg;
    } catch { /* keep default */ }
    if (r.status === 400 && /api key/i.test(msg)) msg = "Gemini says the API key is not valid. Paste the key again in Settings.";
    throw new Error(msg);
  }
  let blocked = "";
  for await (const line of readLines(r.body, signal)) {
    if (!line.startsWith("data:")) continue;
    let ev;
    try {
      ev = JSON.parse(line.slice(5).trim());
    } catch {
      continue;
    }
    if (ev.error) throw new Error(ev.error.message || "Gemini stream error");
    if (ev.promptFeedback?.blockReason) blocked = ev.promptFeedback.blockReason;
    for (const part of ev.candidates?.[0]?.content?.parts || []) if (part.text) yield part.text;
  }
  if (blocked) throw new Error("Gemini declined this request (" + blocked + ").");
}

module.exports = { streamClaude, streamOllama, streamGemini, listOllamaModels };
