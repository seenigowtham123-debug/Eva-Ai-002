// Small, safe Markdown renderer. All input is HTML-escaped first; only whitelisted tags are produced.
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const KEYWORDS = new Set(("abstract as async await break case catch class const continue def default defer del do elif else enum except export extends " +
  "finally fn for from func function go if implements import in interface is lambda let match module mut new of package pass private protected pub public raise " +
  "return self static struct super switch this throw trait try type typeof use var void while with yield select where join insert update delete create table " +
  "begin end int string bool float double char long echo fi then done").split(" "));
const LITERALS = new Set(["true", "false", "null", "nil", "None", "True", "False", "undefined", "NaN"]);
const HASH_COMMENT = /^(py|python|sh|bash|shell|zsh|yaml|yml|toml|ini|rb|ruby|r|dockerfile|make|makefile|env)$/;
const DASH_COMMENT = /^(sql|lua|hs|haskell)$/;

export function highlight(code, lang = "") {
  lang = lang.toLowerCase();
  const comment = HASH_COMMENT.test(lang) ? "#[^\\n]*" : DASH_COMMENT.test(lang) ? "--[^\\n]*" : "\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|$)|<!--[\\s\\S]*?(?:-->|$)";
  const re = new RegExp(`(${comment})|("(?:[^"\\\\\\n]|\\\\.)*"?|'(?:[^'\\\\\\n]|\\\\.)*'?|\`(?:[^\`\\\\]|\\\\.)*\`?)|(\\b\\d[\\d_.]*(?:e[+-]?\\d+)?\\b|\\b0x[\\da-f]+\\b)|(\\b[A-Za-z_][\\w]*\\b)`, "gi");
  let out = "";
  let last = 0;
  let m;
  while ((m = re.exec(code))) {
    out += esc(code.slice(last, m.index));
    const [tok, c, s, n, w] = m;
    if (c) out += `<span class="tk-c">${esc(tok)}</span>`;
    else if (s) out += `<span class="tk-s">${esc(tok)}</span>`;
    else if (n) out += `<span class="tk-n">${esc(tok)}</span>`;
    else if (w && KEYWORDS.has(w)) out += `<span class="tk-k">${esc(tok)}</span>`;
    else if (w && LITERALS.has(w)) out += `<span class="tk-l">${esc(tok)}</span>`;
    else if (w && code[m.index + tok.length] === "(") out += `<span class="tk-f">${esc(tok)}</span>`;
    else out += esc(tok);
    last = m.index + tok.length;
    if (!tok.length) re.lastIndex++;
  }
  return out + esc(code.slice(last));
}

function safeUrl(u) {
  return /^(https?:\/\/|mailto:)/i.test(u) ? u : null;
}

function inline(text, stash) {
  // text is already HTML-escaped. Pull out code spans first so their contents stay literal.
  text = text.replace(/`([^`\n]+)`/g, (_, c) => stash(`<code>${c}</code>`));
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
    const u = safeUrl(url.replace(/&amp;/g, "&"));
    return u ? stash(`<a href="${esc(u.replace(/&amp;/g, "&"))}" target="_blank" rel="noopener noreferrer">${label}</a>`) : label;
  });
  text = text.replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,;:!?])/g, (_, pre, url) => pre + stash(`<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`));
  text = text.replace(/\*\*([^*\n]+?)\*\*|__([^_\n]+?)__/g, (_, a, b) => `<strong>${a || b}</strong>`);
  text = text.replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\*)/g, "$1<em>$2</em>").replace(/(^|[^_\w])_([^_\n]+?)_(?![_\w])/g, "$1<em>$2</em>");
  text = text.replace(/~~([^~\n]+?)~~/g, "<del>$1</del>");
  return text;
}

export function renderMarkdown(src) {
  const blocks = [];
  // 1) fenced code blocks (an unterminated fence is treated as open, so streaming looks right)
  let text = src.replace(/(^|\n)```([\w+#.-]*)[^\n]*\n([\s\S]*?)(?:\n```(?=\n|$)|$)/g, (_, pre, lang, code) => {
    blocks.push({ lang, code });
    return `${pre}\u0000B${blocks.length - 1}\u0000`;
  });
  text = esc(text);

  const stashed = [];
  const stash = (html) => `\u0001${stashed.push(html) - 1}\u0001`;
  const il = (s) => inline(s, stash);

  const lines = text.split("\n");
  const out = [];
  let i = 0;
  const isTableSep = (l) => /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(l) && l.includes("-") && l.includes("|");
  const cells = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

  while (i < lines.length) {
    const line = lines[i];
    let m;
    if (!line.trim()) { i++; continue; }
    if ((m = /^\u0000B(\d+)\u0000$/.exec(line.trim()))) {
      const { lang, code } = blocks[+m[1]];
      out.push(`<div class="code"><div class="code-head"><span>${esc(lang || "text")}</span><button type="button" class="code-copy" data-copy>Copy</button></div><pre><code>${highlight(code, lang)}</code></pre></div>`);
      i++; continue;
    }
    if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) {
      out.push(`<h${m[1].length}>${il(m[2])}</h${m[1].length}>`); i++; continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push("<hr>"); i++; continue; }
    if (/^&gt;\s?/.test(line)) {
      const q = [];
      while (i < lines.length && /^&gt;\s?/.test(lines[i])) q.push(lines[i++].replace(/^&gt;\s?/, ""));
      out.push(`<blockquote>${q.map(il).join("<br>")}</blockquote>`); continue;
    }
    if (line.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = cells(line);
      const align = cells(lines[i + 1]).map((c) => (/^:-+:$/.test(c) ? "center" : /-:$/.test(c) ? "right" : ""));
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(cells(lines[i++]));
      const td = (t, c, k) => `<${t}${align[k] ? ` class="al-${align[k]}"` : ""}>${il(c)}</${t}>`;
      out.push(`<div class="table-wrap"><table><thead><tr>${head.map((c, k) => td("th", c, k)).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${head.map((_, k) => td("td", r[k] || "", k)).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      // lists, with simple nesting by indentation
      const items = [];
      while (i < lines.length && (/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        const lm = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (lm) items.push({ indent: lm[1].length, ordered: /\d/.test(lm[2]), text: lm[3] });
        else items[items.length - 1].text += " " + lines[i].trim();
        i++;
      }
      const build = (idx, indent) => {
        const ordered = items[idx].ordered;
        let html = `<${ordered ? "ol" : "ul"}>`;
        while (idx < items.length && items[idx].indent >= indent) {
          if (items[idx].indent > indent) {
            const [sub, next] = build(idx, items[idx].indent);
            html = html.replace(/<\/li>$/, sub + "</li>");
            idx = next;
            continue;
          }
          const task = /^\[( |x)\]\s+(.*)$/i.exec(items[idx].text);
          html += `<li>${task ? `<input type="checkbox" disabled${task[1] !== " " ? " checked" : ""}> ${il(task[2])}` : il(items[idx].text)}</li>`;
          idx++;
        }
        return [html + `</${ordered ? "ol" : "ul"}>`, idx];
      };
      out.push(build(0, items[0].indent)[0]);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|&gt;|\s*([-*+]|\d+[.)])\s|\u0000B)/.test(lines[i]) && !(lines[i].includes("|") && isTableSep(lines[i + 1] || ""))) para.push(lines[i++]);
    if (!para.length) { para.push(lines[i++]); }
    out.push(`<p>${para.map(il).join("<br>")}</p>`);
  }
  return out.join("\n").replace(/\u0001(\d+)\u0001/g, (_, n) => stashed[+n]);
}
