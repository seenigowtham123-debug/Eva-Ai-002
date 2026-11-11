// Eva orb: a bioluminescent canvas animation (glowing core, drifting seeds, ripples) with smooth state transitions.
// States: idle, listening, thinking, speaking. Inspired by the glow of a forest at night; entirely original code.
const TAU = Math.PI * 2;
const STATES = {
  //            energy swirl hue  spread  rings
  idle:      { e: 0.25, s: 0.15, hue: 172, r: 1.0, ring: 0.0 },
  listening: { e: 0.60, s: 0.30, hue: 190, r: 1.12, ring: 0.5 },
  thinking:  { e: 0.80, s: 1.60, hue: 268, r: 0.92, ring: 0.0 },
  speaking:  { e: 0.75, s: 0.45, hue: 160, r: 1.08, ring: 1.0 },
};
const lerp = (a, b, t) => a + (b - a) * t;

export class EvaOrb {
  constructor(canvas) {
    this.c = canvas; this.ctx = canvas.getContext("2d");
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.cur = { ...STATES.idle }; this.tgt = { ...STATES.idle };
    this.state = "idle"; this.level = 0; this.pulse = 0; this.t = 0; this.rings = [];
    const n = this.reduced ? 40 : innerWidth < 600 ? 90 : 150;
    this.seeds = Array.from({ length: n }, () => this.seed(true));
    this.resize = this.resize.bind(this); this.frame = this.frame.bind(this);
    addEventListener("resize", this.resize); this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }
  seed(initial) {
    return { a: Math.random() * TAU, d: 0.35 + Math.random() * 1.25, v: (Math.random() - 0.5) * 0.4, z: 0.4 + Math.random() * 1.2,
      p: Math.random() * TAU, h: Math.random() < 0.2 ? 280 : 0, life: initial ? Math.random() : 0 };
  }
  setState(name) {
    if (!STATES[name] || name === this.state) return;
    this.state = name; this.tgt = { ...STATES[name] };
    this.rings.push({ r: 0.2, a: 0.8 }); // ripple on every transition
  }
  /** Feed a 0..1 loudness value (mic activity or speech word pulse). */
  setLevel(v) { this.level = Math.max(this.level, Math.min(1, v)); }
  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2), box = this.c.getBoundingClientRect();
    this.w = box.width; this.h = box.height; this.c.width = this.w * dpr; this.c.height = this.h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  frame(ts) {
    const dt = Math.min((ts - (this.last || ts)) / 1000, 0.05); this.last = ts; this.t += dt;
    for (const k of ["e", "s", "hue", "r", "ring"]) this.cur[k] = lerp(this.cur[k], this.tgt[k], 1 - Math.pow(0.001, dt)); // eased, frame-rate independent
    this.level *= Math.pow(0.02, dt);
    if (this.state === "speaking" && Math.random() < dt * 5) this.level = Math.max(this.level, 0.4 + Math.random() * 0.5);
    this.draw(dt);
    this.raf = requestAnimationFrame(this.frame);
  }
  draw(dt) {
    const { ctx, w, h, cur, t } = this, cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.17;
    const breathe = 1 + Math.sin(t * 1.2) * 0.04 + cur.e * 0.05 * Math.sin(t * 3.1);
    const rad = R * cur.r * breathe * (1 + this.level * 0.18);
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";

    // outer aura
    let g = ctx.createRadialGradient(cx, cy, rad * 0.2, cx, cy, rad * 3.4);
    g.addColorStop(0, `hsla(${cur.hue},90%,60%,${0.30 + cur.e * 0.25})`);
    g.addColorStop(0.45, `hsla(${cur.hue + 70},85%,50%,${0.10 + cur.e * 0.08})`);
    g.addColorStop(1, "hsla(220,80%,40%,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    // ripples
    const ringRate = cur.ring * 0.9;
    if (ringRate > 0.05 && Math.random() < dt * ringRate * 1.6) this.rings.push({ r: 1, a: 0.5 });
    this.rings = this.rings.filter((q) => q.a > 0.02);
    for (const q of this.rings) {
      q.r += dt * 1.1; q.a *= Math.pow(0.25, dt);
      ctx.strokeStyle = `hsla(${cur.hue + 20},95%,70%,${q.a})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, rad * (1 + q.r * 1.6), 0, TAU); ctx.stroke();
    }

    // drifting seeds (woodsprite-like): orbit, wobble, twinkle
    for (const s of this.seeds) {
      s.life += dt * 0.12;
      if (s.life > 1) Object.assign(s, this.seed(false));
      s.a += (s.v * 0.4 + cur.s * (0.25 + s.z * 0.2)) * dt;
      const wob = Math.sin(t * 1.3 + s.p) * 0.06 + this.level * 0.12;
      const d = rad * (1.2 + s.d * 1.9 * (cur.s > 1 ? 0.65 : 1)) * (1 + wob);
      const x = cx + Math.cos(s.a) * d, y = cy + Math.sin(s.a) * d * 0.78 + Math.sin(t * 0.7 + s.p) * 6;
      const fade = Math.sin(Math.min(s.life, 1) * Math.PI);
      const tw = 0.55 + 0.45 * Math.sin(t * 3 + s.p * 3);
      const size = (1.2 + s.z * 2.2) * (1 + cur.e * 0.5);
      const hue = s.h || cur.hue + (s.z - 0.8) * 30;
      const sg = ctx.createRadialGradient(x, y, 0, x, y, size * 4);
      sg.addColorStop(0, `hsla(${hue},100%,85%,${0.9 * fade * tw})`);
      sg.addColorStop(0.3, `hsla(${hue},95%,65%,${0.35 * fade * tw})`);
      sg.addColorStop(1, `hsla(${hue},90%,50%,0)`);
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(x, y, size * 4, 0, TAU); ctx.fill();
    }

    // core: layered glow + bright nucleus + thin veins
    g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad * 1.5);
    g.addColorStop(0, "hsla(0,0%,100%,0.95)");
    g.addColorStop(0.25, `hsla(${cur.hue},100%,78%,0.85)`);
    g.addColorStop(0.7, `hsla(${cur.hue + 40},95%,52%,0.35)`);
    g.addColorStop(1, `hsla(${cur.hue + 60},90%,45%,0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, rad * 1.5, 0, TAU); ctx.fill();
    const veins = this.reduced ? 5 : 9;
    ctx.lineWidth = 1;
    for (let i = 0; i < veins; i++) {
      const a0 = (i / veins) * TAU + t * (0.15 + cur.s * 0.3), len = rad * (0.9 + 0.35 * Math.sin(t * 2 + i));
      ctx.strokeStyle = `hsla(${cur.hue + 25},100%,80%,${0.18 + this.level * 0.3})`;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a0) * rad * 0.15, cy + Math.sin(a0) * rad * 0.15);
      ctx.quadraticCurveTo(cx + Math.cos(a0 + 0.5) * len * 0.7, cy + Math.sin(a0 + 0.5) * len * 0.7, cx + Math.cos(a0 + 0.2) * len, cy + Math.sin(a0 + 0.2) * len);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  }
  destroy() { cancelAnimationFrame(this.raf); removeEventListener("resize", this.resize); }
}
