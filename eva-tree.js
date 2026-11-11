// Eva Tree: a glowing, bioluminescent willow drawn on a <canvas>. Original procedural art (no images).
// A dark trunk with flowing light-veins, hundreds of hanging light-strands that sway in the wind and
// react to the pointer, drifting seeds, glowing ground plants and ripples.
// States: idle, listening, thinking, speaking (same API as the old orb: setState, setLevel, destroy).
const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const STATES = {
  //            energy sway  hue  pulse ring
  idle:      { e: 0.35, sw: 0.6, hue: 172, pu: 0.25, ring: 0.0 },
  listening: { e: 0.65, sw: 0.9, hue: 194, pu: 0.55, ring: 0.5 },
  thinking:  { e: 0.95, sw: 1.5, hue: 268, pu: 1.6,  ring: 0.0 },
  speaking:  { e: 0.8,  sw: 1.0, hue: 158, pu: 0.95, ring: 1.0 },
};

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Soft glow sprites, cached per quantised hue so a frame is just drawImage calls.
const sprites = new Map();
function sprite(hue) {
  const key = ((Math.round(hue / 6) * 6) % 360 + 360) % 360;
  let s = sprites.get(key);
  if (s) return s;
  s = document.createElement("canvas");
  s.width = s.height = 64;
  const g = s.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, `hsla(${key},100%,94%,1)`);
  grd.addColorStop(0.22, `hsla(${key},100%,72%,.62)`);
  grd.addColorStop(0.6, `hsla(${key},95%,55%,.14)`);
  grd.addColorStop(1, `hsla(${key},95%,50%,0)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  sprites.set(key, s);
  return s;
}

export class EvaTree {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{stars?: boolean, interactive?: boolean, topPad?: number, ground?: number, density?: number}} [opts]
   */
  constructor(canvas, opts = {}) {
    this.c = canvas;
    this.ctx = canvas.getContext("2d");
    this.opts = { stars: true, interactive: true, topPad: 70, ground: 0.8, density: 1, ...opts };
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.cur = { ...STATES.idle };
    this.tgt = { ...STATES.idle };
    this.state = "idle";
    this.level = 0;
    this.t = 0;
    this.rings = [];
    this.ptr = { x: -9999, y: -9999, on: false };
    this.running = false;
    this.visible = true;
    this.frame = this.frame.bind(this);
    this.resize = this.resize.bind(this);
    this.onMove = (e) => {
      const b = this.c.getBoundingClientRect();
      this.ptr.x = e.clientX - b.left;
      this.ptr.y = e.clientY - b.top;
      this.ptr.on = e.clientX >= b.left && e.clientX <= b.right && e.clientY >= b.top && e.clientY <= b.bottom;
    };
    this.onVis = () => this.syncRun();
    addEventListener("resize", this.resize);
    document.addEventListener("visibilitychange", this.onVis);
    if (this.opts.interactive) addEventListener("pointermove", this.onMove, { passive: true });
    if ("IntersectionObserver" in window) {
      this.io = new IntersectionObserver((en) => { this.visible = en[0]?.isIntersecting !== false; this.syncRun(); });
      this.io.observe(canvas);
    }
    this.resize();
    this.syncRun();
  }

  syncRun() {
    const should = this.visible && !document.hidden;
    if (should && !this.running) { this.running = true; this.last = 0; this.raf = requestAnimationFrame(this.frame); }
    else if (!should && this.running) { this.running = false; cancelAnimationFrame(this.raf); }
  }

  setState(name) {
    if (!STATES[name] || name === this.state) return;
    this.state = name;
    this.tgt = { ...STATES[name] };
    this.rings.push({ r: 0.05, a: 0.7 });
  }
  /** Feed a 0..1 loudness value (microphone activity or a spoken word). */
  setLevel(v) { this.level = Math.max(this.level, clamp(v, 0, 1)); }

  // ---------- geometry (rebuilt on resize) ----------
  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const box = this.c.getBoundingClientRect();
    this.w = Math.max(1, box.width);
    this.h = Math.max(1, box.height);
    this.dpr = dpr;
    this.c.width = Math.round(this.w * dpr);
    this.c.height = Math.round(this.h * dpr);
    this.build();
  }

  build() {
    const { w, h } = this;
    const R = rng(20251025);
    const o = this.opts;
    const cx = w / 2;
    const ground = h * o.ground;
    // H = full tree height unit. Canopy top is about 0.78 H above the ground.
    const H = clamp(Math.min((ground - o.topPad) / 0.78, w * 0.84), 160, 900);
    this.cx = cx; this.ground = ground; this.H = H;
    this.k = H / 700; // size scale for sprites and line widths

    // trunk spine
    const forkY = ground - 0.3 * H;
    const spine = [];
    for (let i = 0; i <= 14; i++) {
      const f = i / 14;
      spine.push({ x: cx + Math.sin(f * 2.4 + 0.4) * 0.016 * H, y: lerp(ground, forkY, f), w: lerp(0.085, 0.05, Math.pow(f, 0.8)) * H + Math.pow(1 - f, 5) * 0.08 * H });
    }
    this.spine = spine;

    // limbs: [{pts:[{x,y}], w0, w1, kind}]
    const limbs = [];
    const bez = (p0, p1, p2, n) => Array.from({ length: n + 1 }, (_, i) => {
      const t = i / n, u = 1 - t;
      return { x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y };
    });
    // roots
    const rootN = 7;
    for (let i = 0; i < rootN; i++) {
      const dir = i / (rootN - 1) * 2 - 1;
      const len = (0.14 + R() * 0.16) * H;
      const p0 = { x: cx + dir * 0.02 * H, y: ground - 0.02 * H };
      const p2 = { x: cx + dir * len * 1.5 + (R() - 0.5) * 20, y: ground + 0.006 * H + R() * 0.03 * H };
      const p1 = { x: lerp(p0.x, p2.x, 0.5), y: p0.y - 0.035 * H };
      limbs.push({ pts: bez(p0, p1, p2, 10), w0: 0.042 * H * (1 - Math.abs(dir) * 0.45), w1: 1.4, kind: "root" });
    }
    // main branches
    const top = spine[spine.length - 1];
    const cyCanopy = ground - 0.57 * H;
    const rx = 0.6 * H, ry = 0.2 * H;
    const branches = [];
    const bn = 10;
    for (let i = 0; i < bn; i++) {
      const a = (i / (bn - 1)) * 2 - 1; // -1..1 left to right
      const tier = i % 3;
      const side = a < 0 ? -1 : 1;
      const start = { x: top.x + side * 0.014 * H, y: lerp(top.y, ground - 0.2 * H, R() * (tier === 0 ? 0.5 : 0.1)) };
      const ang = side * (0.1 + Math.abs(a) * 1.25) + (R() - 0.5) * 0.14;
      const end = { x: cx + Math.sin(ang) * rx * (0.62 + tier * 0.17), y: cyCanopy - Math.cos(ang) * ry * (0.5 + R() * 0.55) + (tier - 1) * 0.02 * H };
      const ctrl = { x: lerp(start.x, end.x, 0.3), y: Math.min(start.y, end.y) - 0.1 * H * (0.6 + R() * 0.6) };
      const pts = bez(start, ctrl, end, 14);
      const l = { pts, w0: lerp(0.04, 0.024, tier / 2) * H, w1: 1.8, kind: "branch" };
      limbs.push(l);
      branches.push(l);
    }
    this.limbs = limbs;

    // hanging light strands
    const strands = [];
    const per = Math.round(23 * o.density * (w < 520 ? 0.7 : 1));
    for (const b of branches) {
      for (let j = 0; j < per; j++) {
        const t = 0.3 + R() * 0.7;
        const p = b.pts[Math.min(b.pts.length - 1, Math.round(t * (b.pts.length - 1)))];
        const room = ground - 0.025 * H - p.y;
        if (room < 0.05 * H) continue;
        const L = Math.min(room * (0.55 + R() * 0.45), (0.14 + R() * 0.36) * H);
        strands.push({ ax: p.x + (R() - 0.5) * 6, ay: p.y, L, ph: R() * TAU, amp: (0.012 + R() * 0.03) * H, sp: 0.6 + R() * 0.8, dh: (R() - 0.5) * 40, side: Math.sign(p.x - cx) || 1, pu: R(), pp: R(), beads: [0.2 + R() * 0.1, 0.4 + R() * 0.1, 0.6 + R() * 0.1, 0.8 + R() * 0.1, 1] });
      }
    }
    this.strands = strands;

    // seeds, ground plants, stars
    const nSeeds = Math.round((this.reduced ? 30 : w < 520 ? 60 : 110) * o.density);
    this.seeds = Array.from({ length: nSeeds }, () => this.newSeed(R, true));
    this.plants = Array.from({ length: Math.round(46 * o.density) }, () => {
      const a = R() * TAU, d = Math.sqrt(R());
      return { x: cx + Math.cos(a) * d * 0.62 * H, y: ground + Math.sin(a) * d * 0.045 * H + 0.012 * H, ph: R() * TAU, s: 0.5 + R(), tall: 6 + R() * 22, h: R() < 0.2 ? 285 : 0 };
    });
    this.stars = o.stars ? Array.from({ length: 80 }, () => ({ x: R() * w, y: R() * ground * 0.8, r: 0.4 + R() * 1.1, ph: R() * TAU, sp: 0.5 + R() * 2 })) : [];
    this.rand = R;
    this.renderBody();
  }

  newSeed(R = Math.random, initial = false) {
    const a = R() * TAU;
    return { a, d: 0.15 + R() * 0.55, y: initial ? R() : 0, sp: 0.01 + R() * 0.03, ph: R() * TAU, z: 0.5 + R() * 1.2, h: R() < 0.18 ? 285 : 0, life: initial ? R() : 0 };
  }

  // The dark tree body is static, so it is painted once to an offscreen canvas.
  renderBody() {
    const { w, h, dpr } = this;
    const b = (this.body = this.body || document.createElement("canvas"));
    b.width = Math.round(w * dpr); b.height = Math.round(h * dpr);
    const g = b.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.lineCap = "round"; g.lineJoin = "round";
    const body = "#07131d";
    for (const l of this.limbs) {
      const n = l.pts.length - 1;
      for (let i = 0; i < n; i++) {
        g.strokeStyle = body;
        g.lineWidth = lerp(l.w0, l.w1, Math.pow(i / n, 0.8));
        g.beginPath(); g.moveTo(l.pts[i].x, l.pts[i].y); g.lineTo(l.pts[i + 1].x, l.pts[i + 1].y); g.stroke();
      }
    }
    // trunk polygon
    const L = [], Rr = [];
    for (const p of this.spine) { L.push({ x: p.x - p.w / 2, y: p.y }); Rr.push({ x: p.x + p.w / 2, y: p.y }); }
    const grad = g.createLinearGradient(this.cx - this.H * 0.08, 0, this.cx + this.H * 0.08, 0);
    grad.addColorStop(0, "#0b1f2c"); grad.addColorStop(0.5, "#050d15"); grad.addColorStop(1, "#091a26");
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(L[0].x, L[0].y);
    for (let i = 1; i < L.length; i++) g.lineTo(L[i].x, L[i].y);
    for (let i = Rr.length - 1; i >= 0; i--) g.lineTo(Rr[i].x, Rr[i].y);
    g.closePath(); g.fill();
    this.trunkEdges = { L, R: Rr };
  }

  // ---------- frame loop ----------
  frame(ts) {
    if (!this.running) return;
    const dt = Math.min((ts - (this.last || ts)) / 1000, 0.05);
    this.last = ts;
    this.t += dt * (this.reduced ? 0.25 : 1);
    for (const k of ["e", "sw", "hue", "pu", "ring"]) this.cur[k] = lerp(this.cur[k], this.tgt[k], 1 - Math.pow(0.002, dt));
    this.level *= Math.pow(0.03, dt);
    if (this.state === "speaking" && Math.random() < dt * 5) this.level = Math.max(this.level, 0.4 + Math.random() * 0.5);
    this.draw(dt);
    this.raf = requestAnimationFrame(this.frame);
  }

  draw(dt) {
    const { ctx, w, h, cur, t, cx, ground, H, k } = this;
    const lv = this.level;
    const hue = cur.hue;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";

    // stars
    for (const s of this.stars) {
      const a = 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph));
      ctx.fillStyle = `hsla(${hue + 20},60%,85%,${a * 0.7})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
    }

    // canopy aura + ground glow
    const cyC = ground - 0.5 * H;
    let g = ctx.createRadialGradient(cx, cyC, H * 0.05, cx, cyC, H * 0.85);
    g.addColorStop(0, `hsla(${hue},90%,55%,${0.16 + cur.e * 0.16 + lv * 0.12})`);
    g.addColorStop(0.5, `hsla(${hue + 60},85%,45%,${0.05 + cur.e * 0.05})`);
    g.addColorStop(1, `hsla(${hue + 80},80%,40%,0)`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(cx, ground + 0.01 * H); ctx.scale(1, 0.2);
    g = ctx.createRadialGradient(0, 0, 0, 0, 0, H * 0.7);
    g.addColorStop(0, `hsla(${hue},95%,60%,${0.4 + cur.e * 0.25 + lv * 0.2})`);
    g.addColorStop(0.5, `hsla(${hue + 30},90%,50%,${0.12 + cur.e * 0.08})`);
    g.addColorStop(1, `hsla(${hue + 40},90%,40%,0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, H * 0.7, 0, TAU); ctx.fill();
    ctx.restore();

    // ripples on the ground (state changes, speaking)
    const rate = cur.ring * 0.8;
    if (rate > 0.05 && Math.random() < dt * rate * 1.4) this.rings.push({ r: 0.08, a: 0.55 });
    this.rings = this.rings.filter((q) => q.a > 0.02);
    for (const q of this.rings) {
      q.r += dt * 0.55; q.a *= Math.pow(0.35, dt);
      ctx.strokeStyle = `hsla(${hue + 15},95%,70%,${q.a})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(cx, ground + 0.012 * H, q.r * H, q.r * H * 0.2, 0, 0, TAU); ctx.stroke();
    }

    // ground plants
    const spr = sprite(hue);
    for (const p of this.plants) {
      const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 1.4 * p.s + p.ph));
      const sp2 = p.h ? sprite(p.h) : spr;
      ctx.globalAlpha = (0.35 + cur.e * 0.5 + lv * 0.4) * tw;
      ctx.strokeStyle = `hsla(${p.h || hue},90%,65%,.5)`; ctx.lineWidth = 1;
      const sway = Math.sin(t * 0.9 + p.ph) * 3;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(p.x + sway * 0.4, p.y - p.tall * 0.5 * k, p.x + sway, p.y - p.tall * k); ctx.stroke();
      const s = (10 + 14 * p.s) * k * 1.6;
      ctx.drawImage(sp2, p.x + sway - s / 2, p.y - p.tall * k - s / 2, s, s);
    }
    ctx.globalAlpha = 1;

    // dark body (trunk, roots, branches)
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(this.body, 0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";

    // rim light on trunk + flowing veins (animated dashes)
    const edges = this.trunkEdges;
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = `hsla(${hue},90%,62%,${0.22 + cur.e * 0.25})`;
    for (const side of [edges.L, edges.R]) {
      ctx.beginPath(); side.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
    }
    ctx.setLineDash([5 * k + 2, 16 * k + 6]);
    ctx.lineDashOffset = -t * (14 + cur.e * 40) * (1 + lv);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = `hsla(${hue + 10},100%,72%,${0.28 + cur.e * 0.4 + lv * 0.3})`;
    for (let v = 0; v < 5; v++) {
      const off = (v / 4 - 0.5) * 0.7;
      ctx.beginPath();
      this.spine.forEach((p, i) => { const x = p.x + off * p.w, y = p.y; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
    }
    ctx.lineWidth = 1.1;
    for (const l of this.limbs) {
      ctx.strokeStyle = `hsla(${hue + 20},100%,70%,${0.18 + cur.e * 0.3 + lv * 0.25})`;
      ctx.beginPath(); l.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
    }
    ctx.setLineDash([]);

    // hanging strands
    const sw = cur.sw * (this.reduced ? 0.3 : 1);
    const pointer = this.ptr.on ? this.ptr : null;
    const pr = 90 * Math.max(0.6, k);
    const N = 16;
    ctx.lineWidth = Math.max(0.8, 1.15 * k * 1.3);
    const beadAlpha = [];
    for (let si = 0; si < this.strands.length; si++) {
      const s = this.strands[si];
      const pts = s.cache || (s.cache = Array.from({ length: N + 1 }, () => ({ x: 0, y: 0 })));
      const gust = Math.sin(t * 0.33 + s.ax * 0.008) * 0.012 * H * sw;
      for (let i = 0; i <= N; i++) {
        const f = i / N, ff = f * f;
        let x = s.ax + Math.sin(t * s.sp * sw * 1.6 + s.ph - f * 2.2) * s.amp * ff * (0.6 + sw * 0.5) + gust * f + s.side * Math.sin(f * 2.2) * s.L * 0.06 + (lv * Math.sin(t * 9 + s.ph + f * 5)) * 3 * ff;
        let y = s.ay + f * s.L;
        if (pointer) {
          const dx = x - pointer.x, dy = y - pointer.y, d2 = dx * dx + dy * dy;
          if (d2 < pr * pr) { const d = Math.sqrt(d2) || 1, push = Math.pow(1 - d / pr, 2) * 26 * k * 1.5 * (0.3 + f); x += (dx / d) * push; y += (dy / d) * push * 0.4; }
        }
        pts[i].x = x; pts[i].y = y;
      }
      const sh = hue + s.dh;
      const a = 0.22 + cur.e * 0.34 + lv * 0.18;
      for (let part = 0; part < 3; part++) {
        const i0 = Math.floor((part * N) / 3), i1 = Math.floor(((part + 1) * N) / 3);
        ctx.strokeStyle = `hsla(${sh},90%,64%,${a * (1 - part * 0.28)})`;
        ctx.beginPath(); ctx.moveTo(pts[i0].x, pts[i0].y);
        for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
      // beads
      const sp1 = sprite(sh);
      for (let b = 0; b < s.beads.length; b++) {
        const f = s.beads[b];
        const tw = 0.5 + 0.5 * Math.sin(t * (1.1 + s.sp) + s.ph * (b + 1));
        const idx = Math.min(N, Math.round(f * N));
        const sz = (7 + 8 * tw + (b === 4 ? 6 : 0)) * k * 1.7 * (0.8 + cur.e * 0.5 + lv * 0.4);
        ctx.globalAlpha = clamp((0.3 + 0.7 * tw) * (0.35 + cur.e * 0.65), 0, 1);
        ctx.drawImage(sp1, pts[idx].x - sz / 2, pts[idx].y - sz / 2, sz, sz);
      }
      ctx.globalAlpha = 1;
      // travelling light pulse (more and faster while thinking)
      if (s.pu < clamp(cur.pu / 1.7 + 0.08, 0, 1)) {
        const f = (t * (0.18 + cur.pu * 0.32) * (0.7 + s.sp * 0.4) + s.pp) % 1;
        const idx = Math.min(N, Math.floor(f * N));
        const sz = 22 * k * 1.7 * (1 + cur.e * 0.6);
        ctx.globalAlpha = Math.sin(f * Math.PI) * 0.95;
        ctx.drawImage(sprite(hue + 25), pts[idx].x - sz / 2, pts[idx].y - sz / 2, sz, sz);
        ctx.globalAlpha = 1;
      }
    }

    // drifting seeds (woodsprites)
    for (const s of this.seeds) {
      s.life += dt * (0.05 + cur.e * 0.05);
      if (s.life > 1) Object.assign(s, this.newSeed(Math.random, false));
      s.y += dt * (s.sp + cur.e * 0.02);
      const rise = s.life;
      const ang = s.a + t * (0.1 + cur.sw * 0.08) * s.z;
      const rad = (0.2 + s.d) * H * (0.5 + rise * 0.55);
      const x = cx + Math.cos(ang) * rad * 0.9 + Math.sin(t * 0.7 + s.ph) * 8;
      const y = ground - 0.05 * H - rise * 0.8 * H + Math.sin(ang) * rad * 0.18 + Math.sin(t * 1.1 + s.ph) * 6;
      const fade = Math.sin(clamp(rise, 0, 1) * Math.PI);
      const tw = 0.55 + 0.45 * Math.sin(t * 3 + s.ph * 3);
      const sz = (6 + s.z * 7) * k * 1.8 * (1 + cur.e * 0.4 + lv * 0.5);
      ctx.globalAlpha = clamp(fade * tw * (0.7 + cur.e * 0.3), 0, 1);
      ctx.drawImage(s.h ? sprite(s.h) : spr, x - sz / 2, y - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    removeEventListener("resize", this.resize);
    removeEventListener("pointermove", this.onMove);
    document.removeEventListener("visibilitychange", this.onVis);
    this.io?.disconnect();
  }
}
