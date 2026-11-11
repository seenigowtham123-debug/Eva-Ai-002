const crypto = require("crypto");

function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Optional shared-password gate for /api/*. Disabled when no token is configured.
function requireToken(token) {
  return (req, res, next) => {
    if (!token) return next();
    const header = req.get("authorization") || "";
    const given = header.startsWith("Bearer ") ? header.slice(7) : req.get("x-access-token") || "";
    if (given && safeEqual(given, token)) return next();
    res.status(401).json({ error: "Access token required.", code: "auth" });
  };
}

module.exports = { requireToken, safeEqual };
