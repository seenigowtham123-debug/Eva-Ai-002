// Phone actions the assistant may propose. Nothing runs without the user's confirmation (tap or saying yes).
// Everything is rebuilt from validated fields here; the model never supplies a raw URL scheme.
const NUM = /^\+?[\d\s-]{3,20}$/;
const digits = (s) => String(s || "").replace(/[^\d+]/g, "");
const enc = encodeURIComponent;

/** Pulls a trailing "ACTION: {json}" line out of a reply. Returns { text, action }. */
export function extractAction(content) {
  const m = /^\s*ACTION:\s*(\{.*\})\s*$/m.exec(content || "");
  if (!m) return { text: content, action: null };
  let a = null;
  try { a = JSON.parse(m[1]); } catch { /* malformed: ignore */ }
  return { text: content.replace(m[0], "").trim(), action: a && typeof a === "object" ? normalise(a) : null };
}

/** @returns {{type:string,label:string,url:string,risky:boolean}|null} */
export function normalise(a) {
  const t = String(a.type || "");
  const q = String(a.query || "").slice(0, 200).trim();
  switch (t) {
    case "open_url": {
      let u; try { u = new URL(String(a.url)); } catch { return null; }
      return u.protocol === "https:" ? { type: t, label: "Open " + u.hostname, url: u.href, risky: false } : null;
    }
    case "youtube": return q ? { type: t, label: "Search YouTube: " + q, url: "https://www.youtube.com/results?search_query=" + enc(q), risky: false } : null;
    case "search": return q ? { type: t, label: "Search Google: " + q, url: "https://www.google.com/search?q=" + enc(q), risky: false } : null;
    case "maps": return q ? { type: t, label: "Show on Maps: " + q, url: "https://www.google.com/maps/search/?api=1&query=" + enc(q), risky: false } : null;
    case "call": return NUM.test(String(a.to || "")) ? { type: t, label: "Call " + digits(a.to), url: "tel:" + digits(a.to), risky: true } : null;
    case "sms": {
      if (!NUM.test(String(a.to || ""))) return null;
      const body = String(a.body || "").slice(0, 500);
      return { type: t, label: `Text ${digits(a.to)}${body ? ": " + body.slice(0, 40) : ""}`, url: `sms:${digits(a.to)}${body ? "?body=" + enc(body) : ""}`, risky: true };
    }
    case "whatsapp": {
      const to = String(a.to || "");
      if (to && !NUM.test(to)) return null;
      const text = String(a.text || "").slice(0, 500);
      return { type: t, label: `WhatsApp${to ? " " + digits(to).replace(/^\+/, "") : ""}${text ? ": " + text.slice(0, 40) : ""}`, url: `https://wa.me/${digits(to).replace(/^\+/, "")}${text ? "?text=" + enc(text) : ""}`, risky: true };
    }
    default: return null;
  }
}

export function runAction(action) {
  if (!action?.url) return;
  if (/^https:/.test(action.url)) window.open(action.url, "_blank", "noopener");
  else location.href = action.url; // tel: / sms: are handed to the phone's dialer / messages app
}

export const YES = /^\s*(yes|yeah|yep|ok|okay|sure|do it|confirm|go ahead|please do|ஆமா|ஆம்|சரி|செய்|போடு|பண்ணு|செய்யுங்கள்|ஓகே)\b/i;
export const NO = /^\s*(no|nope|cancel|stop|don'?t|வேண்டாம்|வேணாம்|இல்லை|நிறுத்து)\b/i;
