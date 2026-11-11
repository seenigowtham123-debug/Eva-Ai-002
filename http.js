// A tiny, dependency-free HTTP toolkit: routing, JSON/multipart bodies, static files, security headers.
const http = require("http");
const fs = require("fs");
const path = require("path");

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8", ".webmanifest": "application/manifest+json", ".woff2": "font/woff2",
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function createApp({ trustProxy = 1 } = {}) {
  const stack = []; // { method, prefix?, regex?, keys?, handlers }

  const addRoute = (method, route, handlers) => {
    const keys = [];
    const regex = new RegExp("^" + route.replace(/:([A-Za-z]+)/g, (_, k) => (keys.push(k), "([^/]+)")) + "/?$");
    stack.push({ method, regex, keys, handlers });
  };
  const app = {
    use(...args) {
      const prefix = typeof args[0] === "string" ? args.shift() : "";
      stack.push({ method: "*", prefix, handlers: args });
    },
    handle(req, res) {
      decorate(req, res, trustProxy);
      let i = 0;
      const nextRoute = (err) => {
        if (err) return fail(res, err);
        while (i < stack.length) {
          const layer = stack[i++];
          if (layer.regex) {
            if (layer.method !== req.method && !(layer.method === "GET" && req.method === "HEAD")) continue;
            const m = layer.regex.exec(req.path);
            if (!m) continue;
            req.params = {};
            layer.keys.forEach((k, n) => (req.params[k] = decodeURIComponent(m[n + 1])));
          } else if (layer.prefix && !(req.path === layer.prefix || req.path.startsWith(layer.prefix + "/"))) {
            continue;
          }
          return runChain(layer.handlers, req, res, nextRoute);
        }
        res.status(404).json({ error: "Not found." });
      };
      nextRoute();
    },
    listen(port, cb) {
      return http.createServer((q, s) => app.handle(q, s)).listen(port, cb);
    },
  };
  for (const m of ["get", "post", "patch", "delete"]) app[m] = (route, ...h) => addRoute(m.toUpperCase(), route, h);
  return app;
}

function runChain(handlers, req, res, done) {
  let k = 0;
  const step = (err) => {
    if (err) return done(err);
    const h = handlers[k++];
    if (!h) return done();
    try {
      const r = h(req, res, step);
      if (r && typeof r.catch === "function") r.catch(done);
    } catch (e) {
      done(e);
    }
  };
  step();
}

function fail(res, err) {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  if (res.headersSent) return res.end();
  res.status(status).json({ error: status >= 500 && !err.expose ? "Server error." : err.message });
}

function clientIp(req, trustProxy) {
  const xff = (req.headers["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (trustProxy > 0 && xff.length) return xff[Math.max(0, xff.length - trustProxy)];
  return req.socket.remoteAddress || "unknown";
}

function decorate(req, res, trustProxy) {
  const url = new URL(req.url, "http://localhost");
  req.path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
  req.query = Object.fromEntries(url.searchParams);
  req.ip = clientIp(req, trustProxy);
  req.get = (h) => req.headers[h.toLowerCase()];
  res.status = (c) => ((res.statusCode = c), res);
  res.set = (k, v) => {
    if (typeof k === "object") for (const [a, b] of Object.entries(k)) res.setHeader(a, b);
    else res.setHeader(k, v);
    return res;
  };
  res.json = (obj) => {
    const body = JSON.stringify(obj);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Length", Buffer.byteLength(body));
    res.end(req.method === "HEAD" ? undefined : body);
  };
  res.text = (s, type = "text/plain; charset=utf-8") => {
    res.setHeader("Content-Type", type);
    res.end(s);
  };
}

// ---- middleware ----
function securityHeaders() {
  return (_req, res, next) => {
    res.set({
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self' http://localhost:* http://127.0.0.1:*; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "Permissions-Policy": "camera=(), microphone=(self), geolocation=()",
    });
    next();
  };
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, "Request body too large."));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// `limit` is a byte count, or a function (req) => byte count (bigger for routes that take images).
function jsonBody(limit = 1_000_000) {
  return async (req, _res, next) => {
    req.body = {};
    if (!/^(POST|PATCH|PUT|DELETE)$/.test(req.method) || !/json/i.test(req.headers["content-type"] || "")) return next();
    const buf = await readBody(req, typeof limit === "function" ? limit(req) : limit);
    if (buf.length) {
      try {
        req.body = JSON.parse(buf.toString("utf8"));
      } catch {
        throw Object.assign(new HttpError(400, "Invalid JSON body."), { expose: true });
      }
    }
    next();
  };
}

// Parses multipart/form-data into req.files = [{ fieldname, originalname, buffer }]
function multipart({ maxFileSize = 2_000_000, maxFiles = 10 } = {}) {
  return async (req, _res, next) => {
    const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(req.headers["content-type"] || "");
    if (!/multipart\/form-data/i.test(req.headers["content-type"] || "") || !m) throw Object.assign(new HttpError(400, "Expected multipart/form-data."), { expose: true });
    const buf = await readBody(req, maxFileSize * maxFiles + 100_000);
    const delim = Buffer.from("--" + (m[1] || m[2]));
    req.files = [];
    let pos = buf.indexOf(delim);
    while (pos >= 0) {
      const start = pos + delim.length;
      if (buf.slice(start, start + 2).toString() === "--") break;
      const next = buf.indexOf(delim, start);
      if (next < 0) break;
      const part = buf.slice(start + 2, next - 2); // strip leading CRLF and trailing CRLF
      const split = part.indexOf("\r\n\r\n");
      if (split > 0) {
        const head = part.slice(0, split).toString("utf8");
        const disp = /content-disposition:[^\r\n]*/i.exec(head)?.[0] || "";
        const filename = /filename="((?:[^"\\]|\\.)*)"/i.exec(disp)?.[1];
        const name = /\bname="([^"]*)"/i.exec(disp)?.[1];
        if (filename !== undefined) {
          const data = part.slice(split + 4);
          if (data.length > maxFileSize) throw Object.assign(new HttpError(413, "File too large (max 2 MB)."), { expose: true });
          if (req.files.length >= maxFiles) throw Object.assign(new HttpError(400, "Too many files."), { expose: true });
          req.files.push({ fieldname: name, originalname: filename, buffer: data });
        }
      }
      pos = next;
    }
    next();
  };
}

// Fixed-window rate limiter, keyed by client IP and a bucket name.
function rateLimit({ max, windowMs = 60_000, name = "default" }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, windowMs).unref();
  return (req, res, next) => {
    const key = name + ":" + req.ip;
    const now = Date.now();
    let h = hits.get(key);
    if (!h || h.reset <= now) hits.set(key, (h = { count: 0, reset: now + windowMs }));
    h.count++;
    res.set({ "RateLimit-Limit": max, "RateLimit-Remaining": Math.max(0, max - h.count), "RateLimit-Reset": Math.ceil((h.reset - now) / 1000) });
    if (h.count > max) {
      res.set("Retry-After", Math.ceil((h.reset - now) / 1000));
      return res.status(429).json({ error: "Too many requests. Please slow down." });
    }
    next();
  };
}

function serveStatic(dir) {
  const root = path.resolve(dir);
  return (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    let rel;
    try {
      rel = decodeURIComponent(req.path);
    } catch {
      return next();
    }
    if (rel === "/") rel = "/index.html";
    const file = path.resolve(root, "." + rel);
    if (file !== root && !file.startsWith(root + path.sep)) return next();
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) return next();
      const ext = path.extname(file).toLowerCase();
      res.set({
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Content-Length": st.size,
        "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=300",
        ETag: `W/"${st.size}-${Math.floor(st.mtimeMs)}"`,
      });
      if (req.headers["if-none-match"] === res.getHeader("ETag")) return res.status(304).end();
      if (req.method === "HEAD") return res.end();
      fs.createReadStream(file).pipe(res);
    });
  };
}

module.exports = { createApp, HttpError, securityHeaders, jsonBody, multipart, rateLimit, serveStatic };
