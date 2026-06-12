const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const finePointerQuery = window.matchMedia("(hover: hover) and (pointer: fine)");

const modeAlias = {
  neuropath: "neuropath",
  "kerr-jp": "kerr",
  kerr: "kerr",
  motorproof: "motorproof",
  supplement: "supplement",
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function ease(value) {
  const v = clamp(value, 0, 1);
  return v * v * (3 - 2 * v);
}

function normalizeMode(projectId) {
  return modeAlias[projectId] || "neuropath";
}

function hashSeed(input) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function subscribeMedia(query, callback) {
  if (typeof query.addEventListener === "function") {
    query.addEventListener("change", callback);
    return;
  }
  query.addListener(callback);
}

class ReducedMotionManager {
  constructor(query) {
    this.query = query;
    this.callbacks = new Set();
    subscribeMedia(this.query, () => {
      this.callbacks.forEach((callback) => callback(this.reduced));
    });
  }

  get reduced() {
    return this.query.matches;
  }

  onChange(callback) {
    this.callbacks.add(callback);
  }
}

class CursorController {
  constructor(dot, ring, motion) {
    this.dot = dot;
    this.ring = ring;
    this.motion = motion;
    this.enabled = false;
    this.visible = false;
    this.pointerSeen = false;
    this.mouseX = -120;
    this.mouseY = -120;
    this.ringX = -120;
    this.ringY = -120;
    this.frame = 0;

    this.handleMove = this.handleMove.bind(this);
    this.handleOver = this.handleOver.bind(this);
    this.handleOut = this.handleOut.bind(this);
    this.handleWindowOut = this.handleWindowOut.bind(this);
    this.animate = this.animate.bind(this);

    this.sync();
    subscribeMedia(finePointerQuery, () => this.sync());
    this.motion.onChange(() => this.sync());
    window.addEventListener("resize", () => this.sync());
    window.addEventListener("blur", () => this.hide());
    window.addEventListener("mouseout", this.handleWindowOut);
  }

  shouldEnable() {
    return (
      Boolean(this.dot && this.ring) &&
      !this.motion.reduced &&
      finePointerQuery.matches &&
      window.innerWidth > 860
    );
  }

  sync() {
    if (this.shouldEnable()) {
      this.enable();
      return;
    }
    this.disable();
  }

  enable() {
    if (this.enabled) {
      return;
    }
    this.enabled = true;
    document.body.classList.add("cursor-enabled");
    document.addEventListener("pointermove", this.handleMove, { passive: true });
    document.addEventListener("pointerover", this.handleOver, { passive: true });
    document.addEventListener("pointerout", this.handleOut, { passive: true });
  }

  disable() {
    if (!this.enabled) {
      return;
    }
    this.enabled = false;
    this.hide();
    document.body.classList.remove("cursor-enabled", "hov");
    document.removeEventListener("pointermove", this.handleMove);
    document.removeEventListener("pointerover", this.handleOver);
    document.removeEventListener("pointerout", this.handleOut);
    this.setDot(-120, -120);
    this.setRing(-120, -120);
  }

  handleMove(event) {
    if (!this.enabled || event.pointerType === "touch") {
      return;
    }
    this.mouseX = event.clientX;
    this.mouseY = event.clientY;
    if (!this.pointerSeen) {
      this.pointerSeen = true;
      this.ringX = this.mouseX;
      this.ringY = this.mouseY;
      this.setRing(this.ringX, this.ringY);
    }
    this.setDot(this.mouseX, this.mouseY);
    this.show();
    if (!this.frame) {
      this.frame = window.requestAnimationFrame(this.animate);
    }
  }

  handleOver(event) {
    if (!this.enabled) {
      return;
    }
    if (event.target.closest("a, button")) {
      document.body.classList.add("hov");
    }
  }

  handleOut(event) {
    if (!this.enabled) {
      return;
    }
    if (!event.relatedTarget || !event.relatedTarget.closest?.("a, button")) {
      document.body.classList.remove("hov");
    }
  }

  handleWindowOut(event) {
    if (!event.relatedTarget) {
      this.hide();
    }
  }

  animate() {
    if (!this.enabled) {
      this.frame = 0;
      return;
    }
    this.ringX += (this.mouseX - this.ringX) * 0.16;
    this.ringY += (this.mouseY - this.ringY) * 0.16;
    this.setRing(this.ringX, this.ringY);
    this.frame = window.requestAnimationFrame(this.animate);
  }

  show() {
    if (this.visible) {
      return;
    }
    this.visible = true;
    document.body.classList.add("cursor-visible");
  }

  hide() {
    this.visible = false;
    this.pointerSeen = false;
    document.body.classList.remove("cursor-visible", "hov");
    if (this.frame) {
      window.cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
  }

  setDot(x, y) {
    if (this.dot) {
      this.dot.style.transform = `translate3d(${x - 4}px, ${y - 4}px, 0)`;
    }
  }

  setRing(x, y) {
    if (!this.ring) {
      return;
    }
    const halfWidth = this.ring.offsetWidth / 2;
    const halfHeight = this.ring.offsetHeight / 2;
    this.ring.style.transform = `translate3d(${x - halfWidth}px, ${
      y - halfHeight
    }px, 0)`;
  }
}

class SpotlightController {
  constructor(surfaces) {
    this.surfaces = surfaces;
    this.setup();
  }

  setup() {
    this.surfaces.forEach((surface) => {
      surface.classList.add("spotlight-surface");
      surface.addEventListener("pointerenter", (event) => this.update(surface, event));
      surface.addEventListener("pointermove", (event) => this.update(surface, event));
      surface.addEventListener("pointerleave", () => surface.classList.remove("is-spotlit"));
    });
  }

  update(surface, event) {
    if (event.pointerType === "touch") {
      return;
    }
    const rect = surface.getBoundingClientRect();
    surface.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
    surface.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
    surface.classList.add("is-spotlit");
  }
}

const RIBBON_GLYPHS = (() => {
  const P = (...pts) => ({ kind: "poly", pts });
  const A = (cx, cy, r, a0, a1) => ({ kind: "arc", cx, cy, r, a0, a1 });
  const E = (cx, cy, rx, ry, a0, a1) => ({ kind: "ellipse", cx, cy, rx, ry, a0, a1 });
  const TAU = Math.PI * 2;
  const glyphs = [
    {
      name: "neuron",
      segs: [
        A(-0.34, 0.04, 0.17, 0, TAU),
        P([-0.46, -0.06], [-0.64, -0.26], [-0.78, -0.5]),
        P([-0.48, 0.13], [-0.68, 0.27], [-0.84, 0.46]),
        P([-0.36, -0.12], [-0.32, -0.4], [-0.44, -0.64]),
        P([-0.17, 0.03], [0.24, -0.01], [0.56, -0.08]),
        P([0.56, -0.08], [0.74, 0.14]),
        Object.assign(A(0.64, -0.14, 0.06, 0, TAU), { tone: "gold" }),
      ],
    },
    {
      name: "ray",
      segs: [
        P([-0.84, -0.2], [-0.36, -0.18], [0.02, -0.32], [0.48, -0.44], [0.84, -0.48]),
        P([-0.84, 0.14], [-0.3, 0.12], [0.08, 0.28], [0.52, 0.42], [0.84, 0.48]),
        A(0.08, -0.02, 0.15, 0, TAU),
        Object.assign(A(0.08, -0.02, 0.27, -2.4, -0.7), { tone: "signal" }),
      ],
    },
    {
      name: "lanes",
      segs: [
        P([-0.78, -0.3], [0.78, -0.3]),
        P([-0.78, 0.02], [0.78, 0.02]),
        P([-0.78, 0.34], [0.78, 0.34]),
        P([0.36, -0.44], [0.36, 0.48]),
        Object.assign(P([-0.48, -0.14], [-0.18, -0.14]), { tone: "gold", w: 1.7 }),
      ],
    },
    {
      name: "capsule",
      segs: [
        A(-0.28, 0, 0.3, Math.PI * 0.5, Math.PI * 1.5),
        A(0.28, 0, 0.3, Math.PI * 1.5, Math.PI * 2.5),
        P([-0.28, -0.3], [0.28, -0.3]),
        P([-0.28, 0.3], [0.28, 0.3]),
        P([0, -0.3], [0, 0.3]),
      ],
    },
    {
      name: "shield",
      segs: [
        P([0, -0.54], [0.44, -0.36], [0.38, 0.22], [0, 0.54], [-0.38, 0.22], [-0.44, -0.36], [0, -0.54]),
        Object.assign(P([-0.18, 0], [-0.04, 0.16], [0.24, -0.18]), { tone: "signal" }),
      ],
    },
    {
      name: "doc",
      segs: [
        P([-0.34, -0.5], [0.12, -0.5], [0.36, -0.26], [0.36, 0.5], [-0.34, 0.5], [-0.34, -0.5]),
        P([0.12, -0.5], [0.12, -0.26], [0.36, -0.26]),
        P([-0.18, -0.04], [0.2, -0.04]),
        P([-0.18, 0.16], [0.1, 0.16]),
      ],
    },
    {
      name: "api",
      segs: [
        P([-0.26, -0.42], [-0.56, 0], [-0.26, 0.42]),
        P([0.26, -0.42], [0.56, 0], [0.26, 0.42]),
        P([0.1, -0.38], [-0.1, 0.38]),
      ],
    },
    {
      name: "report",
      segs: [
        P([-0.4, -0.52], [0.4, -0.52], [0.4, 0.52], [-0.4, 0.52], [-0.4, -0.52]),
        Object.assign(P([-0.22, -0.16], [-0.1, -0.04], [0.18, -0.34]), { tone: "signal" }),
        P([-0.22, 0.14], [0.24, 0.14]),
        P([-0.22, 0.32], [0.08, 0.32]),
      ],
    },
    {
      name: "terminal",
      segs: [
        P([-0.55, -0.4], [0.55, -0.4], [0.55, 0.4], [-0.55, 0.4], [-0.55, -0.4]),
        P([-0.34, -0.12], [-0.14, 0.04], [-0.34, 0.2]),
        P([-0.02, 0.2], [0.3, 0.2]),
      ],
    },
    {
      name: "graph",
      segs: [
        A(-0.44, 0.28, 0.13, 0, TAU),
        A(0.04, -0.36, 0.13, 0, TAU),
        A(0.48, 0.24, 0.13, 0, TAU),
        P([-0.36, 0.18], [-0.04, -0.26]),
        P([0.13, -0.26], [0.4, 0.14]),
        P([-0.31, 0.28], [0.35, 0.25]),
      ],
    },
    {
      name: "database",
      segs: [
        E(0, -0.36, 0.4, 0.14, 0, TAU),
        P([-0.4, -0.36], [-0.4, 0.36]),
        P([0.4, -0.36], [0.4, 0.36]),
        E(0, 0.36, 0.4, 0.14, 0, Math.PI),
        E(0, 0, 0.4, 0.14, 0, Math.PI),
      ],
    },
  ];
  glyphs.forEach((glyph) => {
    glyph.segs.forEach((seg) => {
      if (seg.kind === "poly") {
        let total = 0;
        for (let i = 1; i < seg.pts.length; i += 1) {
          total += Math.hypot(seg.pts[i][0] - seg.pts[i - 1][0], seg.pts[i][1] - seg.pts[i - 1][1]);
        }
        seg.length = total;
      }
    });
  });
  return glyphs;
})();

class GlyphRibbonController {
  constructor(root, motion) {
    this.root = root;
    this.canvas = root?.querySelector("canvas") || null;
    this.ctx = null;
    this.motion = motion;
    this.width = 1;
    this.height = 1;
    this.dpr = 1;
    this.frame = 0;
    this.lastTime = 0;
    this.inView = false;
    this.suspended = false;
    this.waveTime = 0;
    this.momentum = 0;
    this.lastScrollY = window.scrollY;
    this.pointer = { x: 0, y: 0, active: false, strength: 0 };
    this.layers = [];

    if (!this.root || !this.canvas) {
      return;
    }
    this.ctx = this.canvas.getContext("2d");
    this.draw = this.draw.bind(this);
    this.resize = this.resize.bind(this);
    this.setupEvents();
    this.resize();
    this.observe();
    this.motion.onChange(() => {
      this.resize();
      this.syncLoop();
    });
    window.addEventListener("resize", this.resize);
    document.addEventListener("visibilitychange", () => this.syncLoop());
    window.requestAnimationFrame(() => this.root.classList.add("is-ready"));
  }

  setupEvents() {
    this.root.addEventListener(
      "pointermove",
      (event) => {
        if (event.pointerType === "touch" || this.motion.reduced) {
          return;
        }
        const rect = this.canvas.getBoundingClientRect();
        this.pointer.x = event.clientX - rect.left;
        this.pointer.y = event.clientY - rect.top;
        this.pointer.active = true;
      },
      { passive: true }
    );
    this.root.addEventListener("pointerleave", () => {
      this.pointer.active = false;
    });
  }

  observe() {
    const observer = new IntersectionObserver(
      (entries) => {
        this.inView = entries.some((entry) => entry.isIntersecting);
        this.syncLoop();
      },
      { threshold: 0.05 }
    );
    observer.observe(this.root);
  }

  resize() {
    if (!this.ctx) {
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, Math.round(rect.width));
    this.height = Math.max(1, Math.round(rect.height));
    this.dpr = clamp(window.devicePixelRatio || 1, 1, 1.75);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.buildLayers();
    this.renderStatic();
    this.syncLoop();
  }

  buildLayers() {
    const rand = mulberry32(hashSeed(`ribbon-${this.width}-${this.height}`));
    const makeLayer = (config) => {
      const spacing = clamp(this.width / config.density, config.minSpacing, config.maxSpacing);
      const count = Math.ceil((this.width + spacing * 2) / spacing) + 1;
      const span = count * spacing;
      const items = Array.from({ length: count }, (_, index) => ({
        x: -spacing + index * spacing + (rand() - 0.5) * spacing * 0.24,
        glyph: RIBBON_GLYPHS[(index * 3 + config.offset) % RIBBON_GLYPHS.length],
        phase: rand() * Math.PI * 2,
        assembly: 0.35 + rand() * 0.3,
        flash: 0,
      }));
      return Object.assign({}, config, { spacing, span, items });
    };
    this.layers = [
      makeLayer({
        density: 8.6,
        minSpacing: 128,
        maxSpacing: 215,
        offset: 4,
        speed: 12,
        size: this.height * 0.15,
        baseY: this.height * 0.3,
        amp: this.height * 0.05,
        alpha: 0.32,
        lineWidth: 1.35,
        wavePhase: 2.1,
      }),
      makeLayer({
        density: 7,
        minSpacing: 156,
        maxSpacing: 264,
        offset: 0,
        speed: -20,
        size: this.height * 0.27,
        baseY: this.height * 0.58,
        amp: this.height * 0.082,
        alpha: 0.94,
        lineWidth: 2.05,
        wavePhase: 0,
      }),
    ];
  }

  setSuspended(value) {
    this.suspended = value;
    this.syncLoop();
  }

  shouldAnimate() {
    return (
      !this.motion.reduced &&
      this.inView &&
      !this.suspended &&
      !document.hidden &&
      this.layers.length > 0
    );
  }

  syncLoop() {
    if (this.shouldAnimate()) {
      if (!this.frame) {
        this.lastTime = 0;
        this.frame = window.requestAnimationFrame(this.draw);
      }
      return;
    }
    if (this.frame) {
      window.cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
    this.renderStatic();
  }

  filamentY(layer, x) {
    return (
      layer.baseY +
      Math.sin(x * 0.0042 + this.waveTime * 0.55 + layer.wavePhase) * layer.amp +
      Math.sin(x * 0.0011 - this.waveTime * 0.22 + layer.wavePhase * 2) * layer.amp * 0.45
    );
  }

  drawFilament(ctx, layer) {
    const step = 16;
    ctx.lineCap = "round";
    for (let pass = 0; pass < 2; pass += 1) {
      ctx.strokeStyle = pass === 0
        ? `rgba(111, 58, 26, ${0.12 * layer.alpha})`
        : `rgba(210, 162, 95, ${0.1 * layer.alpha})`;
      ctx.lineWidth = pass === 0 ? 1 : 0.8;
      ctx.beginPath();
      for (let x = -step; x <= this.width + step; x += step) {
        const y = this.filamentY(layer, x) + (pass === 0 ? 0 : 7);
        if (x === -step) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }
  }

  renderStatic() {
    if (!this.ctx) {
      return;
    }
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.layers.forEach((layer) => {
      this.drawFilament(this.ctx, layer);
      layer.items.forEach((item) => {
        const y = this.filamentY(layer, item.x);
        this.drawGlyph(this.ctx, item.glyph, item.x, y, layer.size, 0, 1, layer.alpha, layer.lineWidth);
      });
    });
  }

  draw(timeStamp = 0) {
    if (!this.ctx) {
      return;
    }
    const time = timeStamp * 0.001;
    const dt = this.lastTime ? clamp(time - this.lastTime, 0.001, 0.05) : 0.016;
    this.lastTime = time;
    this.pointer.strength += ((this.pointer.active ? 1 : 0) - this.pointer.strength) * 0.07;

    // scroll velocity feeds the current — the glyph stream quickens as you move
    const scrollY = window.scrollY;
    const velocity = Math.abs(scrollY - this.lastScrollY) / Math.max(dt, 0.001);
    this.lastScrollY = scrollY;
    this.momentum = lerp(this.momentum, clamp(velocity / 1500, 0, 1.4), 0.06);
    const flow = 1 + this.momentum * 1.6;
    this.waveTime += dt * flow;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    this.layers.forEach((layer) => {
      this.drawFilament(ctx, layer);
      layer.items.forEach((item) => {
        item.x += layer.speed * flow * dt;
        if (layer.speed < 0 && item.x < -layer.spacing) {
          item.x += layer.span;
        } else if (layer.speed > 0 && item.x > this.width + layer.spacing) {
          item.x -= layer.span;
        }
        const y = this.filamentY(layer, item.x) + Math.sin(time * 0.8 + item.phase) * 3;
        const boost =
          this.pointer.strength > 0.01
            ? ease(1 - Math.hypot(this.pointer.x - item.x, (this.pointer.y - y) * 1.3) / 250) *
              this.pointer.strength *
              1.25
            : 0;
        const alignWave = 0.5 + 0.5 * Math.sin(time * 0.4 - item.x * 0.0052 + item.phase * 0.6);
        const target = clamp(0.26 + alignWave * 0.52 + boost, 0, 1);
        const previous = item.assembly;
        item.assembly = lerp(item.assembly, target, 0.065);
        if (previous < 0.86 && item.assembly >= 0.86) {
          item.flash = 1;
        }
        if (item.flash) {
          item.flash *= Math.exp(-dt * 2.4);
          if (item.flash < 0.02) {
            item.flash = 0;
          }
        }
        const breathe = 1 + Math.sin(time * 0.7 + item.phase) * 0.045;
        const tilt =
          Math.cos(item.x * 0.0042 + this.waveTime * 0.55 + layer.wavePhase) *
          0.11 *
          (1 - item.assembly * 0.72);
        if (item.flash) {
          this.drawGlyph(
            ctx,
            item.glyph,
            item.x,
            y,
            layer.size * breathe * (1 + (1 - item.flash) * 0.26),
            tilt,
            1,
            layer.alpha * item.flash * 0.22,
            layer.lineWidth
          );
        }
        this.drawGlyph(
          ctx,
          item.glyph,
          item.x,
          y,
          layer.size * breathe,
          tilt,
          item.assembly,
          layer.alpha,
          layer.lineWidth
        );
      });
    });

    if (this.frame) {
      this.frame = window.requestAnimationFrame(this.draw);
    }
  }

  drawGlyph(ctx, glyph, x, y, size, tilt, assembly, alpha, lineWidth) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.scale(size, size);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const ghost = 1 - assembly;
    if (ghost > 0.05) {
      ctx.save();
      ctx.rotate(ghost * 0.14);
      ctx.translate(ghost * 0.18, ghost * -0.14);
      ctx.lineWidth = lineWidth / size;
      ctx.strokeStyle = `rgba(156, 81, 38, ${alpha * ghost * 0.26})`;
      for (let i = 0; i < glyph.segs.length; i += 1) {
        this.traceSeg(ctx, glyph.segs[i], 1);
      }
      ctx.restore();
    }

    for (let i = 0; i < glyph.segs.length; i += 1) {
      const seg = glyph.segs[i];
      const fraction = clamp(assembly * 1.5 - i * 0.1, 0.16, 1);
      const segAlpha = alpha * (0.3 + 0.7 * fraction) * (0.42 + assembly * 0.58);
      ctx.lineWidth = ((seg.w || 1) * lineWidth) / size;
      ctx.strokeStyle =
        seg.tone === "gold"
          ? `rgba(202, 146, 80, ${segAlpha})`
          : seg.tone === "signal"
          ? `rgba(111, 147, 155, ${segAlpha})`
          : `rgba(111, 58, 26, ${segAlpha})`;
      this.traceSeg(ctx, seg, fraction);
    }

    if (assembly > 0.9) {
      ctx.fillStyle = `rgba(210, 162, 95, ${(assembly - 0.9) * 7 * alpha})`;
      ctx.beginPath();
      ctx.arc(0, 0.78, 0.04, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  traceSeg(ctx, seg, fraction) {
    const f = clamp(fraction, 0, 1);
    if (f <= 0.01) {
      return;
    }
    if (seg.kind === "arc") {
      ctx.beginPath();
      ctx.arc(seg.cx, seg.cy, seg.r, seg.a0, seg.a0 + (seg.a1 - seg.a0) * f);
      ctx.stroke();
      return;
    }
    if (seg.kind === "ellipse") {
      ctx.beginPath();
      ctx.ellipse(seg.cx, seg.cy, seg.rx, seg.ry, 0, seg.a0, seg.a0 + (seg.a1 - seg.a0) * f);
      ctx.stroke();
      return;
    }
    const pts = seg.pts;
    let remaining = seg.length * f;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length && remaining > 0; i += 1) {
      const dx = pts[i][0] - pts[i - 1][0];
      const dy = pts[i][1] - pts[i - 1][1];
      const len = Math.hypot(dx, dy);
      if (len <= remaining) {
        ctx.lineTo(pts[i][0], pts[i][1]);
        remaining -= len;
      } else {
        const t = remaining / len;
        ctx.lineTo(pts[i - 1][0] + dx * t, pts[i - 1][1] + dy * t);
        remaining = 0;
      }
    }
    ctx.stroke();
  }
}

class PageTraceController {
  constructor(root, motion) {
    this.root = root;
    this.motion = motion;
    if (!this.root) {
      return;
    }
    this.svg = root.querySelector("svg");
    this.basePath = root.querySelector(".trace-base");
    this.flowPath = root.querySelector(".trace-flow");
    this.stationsGroup = root.querySelector(".trace-stations");
    this.probe = root.querySelector(".trace-probe");
    this.tail = root.querySelector(".trace-probe-tail");
    this.endpoint = root.querySelector(".trace-endpoint");
    this.stations = [];
    this.length = 0;
    this.lut = null;
    this.progress = 0;
    this.trail = 0;
    this.target = 0;
    this.frame = 0;
    this.lastTick = 0;
    this.rebuildTimer = 0;
    this.enabled = false;
    this.suspended = false;
    this.pendingRebuild = false;

    this.tick = this.tick.bind(this);
    this.queueRebuild = this.queueRebuild.bind(this);
    this.onScroll = this.onScroll.bind(this);

    window.addEventListener("resize", this.queueRebuild);
    window.addEventListener("load", this.queueRebuild);
    window.addEventListener("scroll", this.onScroll, { passive: true });
    this.motion.onChange(() => this.queueRebuild());
    if ("ResizeObserver" in window) {
      const observer = new ResizeObserver(() => this.queueRebuild());
      observer.observe(document.body);
    }
    this.build();
    this.onScroll();
  }

  setSuspended(value) {
    this.suspended = value;
    if (!value && this.pendingRebuild) {
      this.pendingRebuild = false;
      this.queueRebuild();
    }
  }

  queueRebuild() {
    if (this.suspended) {
      this.pendingRebuild = true;
      return;
    }
    if (this.rebuildTimer) {
      window.clearTimeout(this.rebuildTimer);
    }
    // fade the trace out, rebuild against settled geometry, fade back —
    // the line is never visibly wrong
    if (this.length) {
      this.root.classList.add("is-rebuilding");
    }
    this.rebuildTimer = window.setTimeout(() => {
      this.rebuildTimer = 0;
      this.build();
      this.onScroll(true);
      this.root.classList.remove("is-rebuilding");
    }, 240);
  }

  docTop(element) {
    return element.getBoundingClientRect().top + window.scrollY;
  }

  build() {
    if (!this.svg || !this.flowPath || !this.basePath) {
      return;
    }
    const width = document.documentElement.clientWidth;
    this.enabled = width >= 1268;
    if (!this.enabled) {
      return;
    }
    const docHeight = document.documentElement.scrollHeight;
    this.root.style.height = `${docHeight}px`;
    this.svg.setAttribute("viewBox", `0 0 ${width} ${docHeight}`);
    this.svg.setAttribute("width", String(width));
    this.svg.setAttribute("height", String(docHeight));

    const shellWidth = Math.min(width - 40, 1180);
    const gutter = (width - shellWidth) / 2;
    const leftX = Math.round(Math.max(26, gutter * 0.48));
    const rightX = width - leftX;

    const hero = document.querySelector(".hero");
    const ribbon = document.querySelector(".symbol-ribbon");
    const method = document.getElementById("method");
    const work = document.getElementById("work");
    const cards = Array.from(document.querySelectorAll(".featured-card"));
    const more = document.getElementById("more-work");
    const about = document.getElementById("about");
    const contact = document.getElementById("contact");
    if (!hero || !ribbon || !method || !work || !more || !about || !contact) {
      return;
    }

    const points = [];
    const stations = [];
    const addPoint = (x, y, isStation) => {
      points.push({ x: Math.round(x), y: Math.round(y) });
      if (isStation) {
        stations.push({ pointIndex: points.length - 1 });
      }
    };

    const ribbonTop = this.docTop(ribbon);
    const moreTop = this.docTop(more);
    const aboutTop = this.docTop(about);
    const contactTop = this.docTop(contact);

    addPoint(rightX, this.docTop(hero) + hero.offsetHeight * 0.3, true);
    addPoint(rightX, ribbonTop - 16, false);
    addPoint(leftX, ribbonTop - 16, false);
    addPoint(leftX, this.docTop(method) + method.offsetHeight * 0.55, true);
    addPoint(leftX, this.docTop(work) + 104, true);
    cards.forEach((card) => {
      addPoint(leftX, this.docTop(card) + Math.min(card.offsetHeight * 0.5, 140), true);
    });
    addPoint(leftX, moreTop - 24, false);
    addPoint(rightX, moreTop - 24, false);
    addPoint(rightX, moreTop + 112, true);
    addPoint(rightX, aboutTop - 20, false);
    addPoint(leftX, aboutTop - 20, false);
    addPoint(leftX, aboutTop + 112, true);
    addPoint(leftX, contactTop - 22, false);
    addPoint(rightX, contactTop - 22, false);
    addPoint(rightX, contactTop + 116, false);

    const radius = 26;
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i += 1) {
      const prev = points[i - 1];
      const curr = points[i];
      const next = points[i + 1];
      if (!next) {
        d += ` L ${curr.x} ${curr.y}`;
        break;
      }
      const inDX = Math.sign(curr.x - prev.x);
      const inDY = Math.sign(curr.y - prev.y);
      const outDX = Math.sign(next.x - curr.x);
      const outDY = Math.sign(next.y - curr.y);
      if (inDX === outDX && inDY === outDY) {
        d += ` L ${curr.x} ${curr.y}`;
        continue;
      }
      const inLen = Math.hypot(curr.x - prev.x, curr.y - prev.y);
      const outLen = Math.hypot(next.x - curr.x, next.y - curr.y);
      const r = Math.min(radius, inLen / 2, outLen / 2);
      d += ` L ${curr.x - inDX * r} ${curr.y - inDY * r}`;
      d += ` Q ${curr.x} ${curr.y} ${curr.x + outDX * r} ${curr.y + outDY * r}`;
    }

    const cumulative = [0];
    for (let i = 1; i < points.length; i += 1) {
      cumulative.push(
        cumulative[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
      );
    }

    this.basePath.setAttribute("d", d);
    this.flowPath.setAttribute("d", d);
    this.length = this.flowPath.getTotalLength();
    const scale = this.length / Math.max(1, cumulative[cumulative.length - 1]);
    this.flowPath.style.strokeDasharray = `${this.length}`;

    // sample the path once into a lookup table so scrolling never touches
    // getPointAtLength again
    const sampleCount = Math.round(clamp(Math.ceil(this.length / 6), 64, 2600));
    const xs = new Float32Array(sampleCount + 1);
    const ys = new Float32Array(sampleCount + 1);
    for (let i = 0; i <= sampleCount; i += 1) {
      const sample = this.flowPath.getPointAtLength((this.length * i) / sampleCount);
      xs[i] = sample.x;
      ys[i] = sample.y;
    }
    this.lut = { xs, ys, count: sampleCount };

    this.stationsGroup.replaceChildren();
    this.stations = stations.map((station) => {
      const point = points[station.pointIndex];
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", String(point.x));
      circle.setAttribute("cy", String(point.y));
      circle.setAttribute("r", "3.2");
      this.stationsGroup.append(circle);
      return { length: cumulative[station.pointIndex] * scale, el: circle };
    });

    const last = points[points.length - 1];
    this.startY = points[0].y;
    this.endY = last.y;
    this.endpoint.setAttribute("transform", `translate(${last.x} ${last.y})`);
    this.apply();
  }

  lengthAtY(targetY) {
    // The trace only moves down or sideways, so y is non-decreasing along it.
    const { ys, count } = this.lut;
    let low = 0;
    let high = count;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (ys[mid] < targetY) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    if (low <= 0) {
      return 0;
    }
    const prev = ys[low - 1];
    const next = ys[Math.min(low, count)];
    const frac = next > prev ? clamp((targetY - prev) / (next - prev), 0, 1) : 0;
    return ((low - 1 + frac) / count) * this.length;
  }

  pointAt(distance) {
    const { xs, ys, count } = this.lut;
    const t = clamp(distance / this.length, 0, 1) * count;
    const index = Math.min(count - 1, Math.floor(t));
    const frac = t - index;
    return {
      x: xs[index] + (xs[index + 1] - xs[index]) * frac,
      y: ys[index] + (ys[index + 1] - ys[index]) * frac,
    };
  }

  onScroll(snap = false) {
    if (!this.enabled || !this.length || !this.lut) {
      return;
    }
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const scrollProgress = clamp(window.scrollY / max, 0, 1);
    const eyeY = clamp(window.scrollY + window.innerHeight * 0.58, this.startY, this.endY);
    const targetY = lerp(eyeY, this.endY, ease((scrollProgress - 0.86) / 0.14));
    this.target = clamp(this.lengthAtY(targetY) / this.length, 0, 1);
    if (snap || this.motion.reduced) {
      this.progress = this.target;
      this.trail = this.target;
      this.apply();
      return;
    }
    if (!this.frame) {
      this.lastTick = 0;
      this.frame = window.requestAnimationFrame(this.tick);
    }
  }

  tick(now) {
    this.frame = 0;
    const dt = this.lastTick ? clamp((now - this.lastTick) / 1000, 0.001, 0.05) : 0.016;
    this.lastTick = now;
    // time-based critical damping — identical feel at any frame rate
    this.progress += (this.target - this.progress) * (1 - Math.exp(-dt * 8.5));
    this.trail += (this.progress - this.trail) * (1 - Math.exp(-dt * 4));
    if (
      Math.abs(this.target - this.progress) > 0.00035 ||
      Math.abs(this.progress - this.trail) > 0.00035
    ) {
      this.frame = window.requestAnimationFrame(this.tick);
    } else {
      this.progress = this.target;
      this.trail = this.target;
    }
    this.apply();
  }

  apply() {
    if (!this.length || !this.lut) {
      return;
    }
    const reduced = this.motion.reduced;
    const distance = this.length * (reduced ? 1 : this.progress);
    this.flowPath.style.strokeDashoffset = `${this.length - distance}`;
    if (!reduced) {
      const point = this.pointAt(distance);
      this.probe.setAttribute("transform", `translate(${point.x} ${point.y})`);
      this.probe.style.opacity = "1";
      const tailPoint = this.pointAt(this.length * this.trail);
      this.tail.setAttribute("transform", `translate(${tailPoint.x} ${tailPoint.y})`);
      this.tail.style.opacity = "1";
    } else {
      this.probe.style.opacity = "0";
      this.tail.style.opacity = "0";
    }
    for (let i = 0; i < this.stations.length; i += 1) {
      const station = this.stations[i];
      station.el.classList.toggle("is-passed", distance >= station.length - 2);
    }
    this.root.classList.toggle("is-arrived", reduced || this.progress > 0.975);
  }
}

class HeroFieldController {
  constructor(root, motion) {
    this.root = root;
    this.canvas = root?.querySelector("canvas") || null;
    this.ctx = null;
    this.motion = motion;
    this.width = 1;
    this.height = 1;
    this.dpr = 1;
    this.frame = 0;
    this.resizeFrame = 0;
    this.inView = false;
    this.hoverMode = null;
    this.lockedMode = null;
    this.pointer = { x: 0, y: 0, active: false, strength: 0 };
    this.scene = null;
    this.trails = [];

    this.draw = this.draw.bind(this);
    this.resize = this.resize.bind(this);
    this.queueResize = this.queueResize.bind(this);

    if (!this.root || !this.canvas) {
      return;
    }

    this.ctx = this.canvas.getContext("2d");
    this.setupEvents();
    this.resize();
    this.observe();
    this.motion.onChange(() => {
      this.resize();
      this.syncLoop();
    });
    window.addEventListener("resize", this.queueResize);
    document.addEventListener("visibilitychange", () => this.syncLoop());
  }

  setupEvents() {
    const handleWindowMove = (event) => {
      if (event.pointerType === "touch" || this.motion.reduced || !this.inView) {
        return;
      }
      const rect = this.root.getBoundingClientRect();
      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      if (!inside) {
        this.pointer.active = false;
        return;
      }
      this.pointer.x = event.clientX - rect.left;
      this.pointer.y = event.clientY - rect.top;
      this.pointer.active = true;
      this.trails.push({
        x: this.pointer.x,
        y: this.pointer.y,
        life: 1,
        phase: Math.random() * Math.PI * 2,
      });
      if (this.trails.length > 42) {
        this.trails.shift();
      }
    };
    window.addEventListener("pointermove", handleWindowMove, { passive: true });
  }

  observe() {
    const observer = new IntersectionObserver(
      (entries) => {
        this.inView = entries.some((entry) => entry.isIntersecting);
        this.syncLoop();
      },
      { threshold: 0.08 }
    );
    observer.observe(this.root);
  }

  queueResize() {
    if (this.resizeFrame) {
      window.cancelAnimationFrame(this.resizeFrame);
    }
    this.resizeFrame = window.requestAnimationFrame(() => {
      this.resizeFrame = 0;
      this.resize();
    });
  }

  resize() {
    const rect = this.root.getBoundingClientRect();
    this.width = Math.max(1, Math.round(rect.width));
    this.height = Math.max(1, Math.round(rect.height));
    this.dpr = clamp(window.devicePixelRatio || 1, 1, 1.85);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.scene = this.buildScene();
    this.draw(0);
    this.syncLoop();
  }

  buildScene() {
    const rand = mulberry32(hashSeed(`hero-${this.width}-${this.height}`));
    const count = this.width < 580 ? 130 : this.width < 900 ? 230 : 390;
    const particles = Array.from({ length: count }, (_, index) => {
      const angle = rand() * Math.PI * 2;
      const radius = Math.sqrt(rand());
      const centerX = this.width * (0.6 + (rand() - 0.5) * 0.2);
      const centerY = this.height * 0.5;
      const baseX = this.width * (0.08 + rand() * 0.9);
      return {
        x: centerX + Math.cos(angle) * radius * this.width * 0.42,
        y: centerY + Math.sin(angle) * radius * this.height * 0.42,
        baseX,
        baseY: this.height * (0.08 + rand() * 0.84),
        fade: 0.18 + 0.82 * ease((baseX / this.width - 0.3) / 0.42),
        vx: 0,
        vy: 0,
        size: rand() > 0.82 ? 2.2 + rand() * 1.8 : 0.9 + rand() * 1.4,
        phase: rand() * Math.PI * 2,
        kind: rand() > 0.74 ? "dash" : "point",
        tint: rand() > 0.93 ? "cool" : rand() > 0.48 ? "gold" : "copper",
        index,
      };
    });

    const anchors = Array.from({ length: 18 }, (_, index) => ({
      x: this.width * (0.28 + rand() * 0.66),
      y: this.height * (0.14 + rand() * 0.72),
      phase: index * 0.52 + rand(),
    }));

    return { particles, anchors };
  }

  get mode() {
    return this.lockedMode || this.hoverMode || "idle";
  }

  setHoverMode(mode) {
    this.hoverMode = mode;
  }

  setLockedMode(mode) {
    this.lockedMode = mode;
  }

  setSuspended(value) {
    this.suspended = value;
    this.syncLoop();
  }

  shouldAnimate() {
    return (
      !this.motion.reduced &&
      this.inView &&
      !this.suspended &&
      !document.hidden &&
      Boolean(this.scene)
    );
  }

  syncLoop() {
    if (this.shouldAnimate()) {
      if (!this.frame) {
        this.frame = window.requestAnimationFrame(this.draw);
      }
      return;
    }
    if (this.frame) {
      window.cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
    this.draw(0);
  }

  color(tint, alpha) {
    if (tint === "cool") {
      return `rgba(111, 147, 155, ${alpha})`;
    }
    if (tint === "gold") {
      return `rgba(216, 170, 104, ${alpha})`;
    }
    return `rgba(163, 95, 52, ${alpha})`;
  }

  draw(timeStamp = 0) {
    if (!this.ctx || !this.scene) {
      return;
    }

    const time = timeStamp * 0.001;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    this.pointer.strength += ((this.pointer.active ? 1 : 0) - this.pointer.strength) * 0.08;

    const glow = ctx.createRadialGradient(
      this.width * 0.62,
      this.height * 0.42,
      0,
      this.width * 0.62,
      this.height * 0.42,
      this.width * 0.48
    );
    glow.addColorStop(0, "rgba(216, 170, 104, 0.10)");
    glow.addColorStop(1, "rgba(216, 170, 104, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, this.width, this.height);

    this.drawAmbientAnchors(ctx, time);
    this.drawTrailNetwork(ctx, time);
    this.drawParticles(ctx, time);

    if (this.frame) {
      this.frame = window.requestAnimationFrame(this.draw);
    }
  }

  drawAmbientAnchors(ctx, time) {
    const anchors = this.scene.anchors;
    ctx.save();
    ctx.lineCap = "round";
    anchors.forEach((anchor, index) => {
      const next = anchors[(index * 5 + 3) % anchors.length];
      const distance = Math.hypot(anchor.x - next.x, anchor.y - next.y);
      if (distance > this.width * 0.35) {
        return;
      }
      ctx.globalAlpha = 0.08 + Math.sin(time * 0.7 + anchor.phase) * 0.025;
      ctx.strokeStyle = index % 3 === 0 ? "rgba(111, 147, 155, 0.38)" : "rgba(124, 71, 40, 0.34)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(anchor.x, anchor.y);
      ctx.quadraticCurveTo(
        (anchor.x + next.x) * 0.5,
        (anchor.y + next.y) * 0.5 + Math.sin(time + index) * 8,
        next.x,
        next.y
      );
      ctx.stroke();
    });
    ctx.restore();
  }

  drawTrailNetwork(ctx, time) {
    if (!this.trails.length) {
      return;
    }
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let index = 0; index < this.trails.length - 1; index += 1) {
      const a = this.trails[index];
      const b = this.trails[index + 1];
      a.life -= 0.005;
      const alpha = clamp(a.life, 0, 1) * 0.24;
      if (alpha <= 0) {
        continue;
      }
      ctx.strokeStyle = `rgba(163, 95, 52, ${alpha})`;
      ctx.lineWidth = 1.2 + alpha * 3;
      ctx.setLineDash(index % 4 === 0 ? [3, 10] : []);
      ctx.lineDashOffset = -time * 18;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 - 16, b.x, b.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    this.trails = this.trails.filter((trail) => trail.life > 0.03);
    ctx.restore();
  }

  drawParticles(ctx, time) {
    const modeFactor = this.mode === "idle" ? 0.3 : 0.55;
    const pointerStrength = this.pointer.strength;
    const nearNodes = Array.from({ length: 7 }, (_, index) => {
      const angle = (Math.PI * 2 * index) / 7 + time * 0.4;
      const radius = 34 + (index % 3) * 18;
      return {
        x: this.pointer.x + Math.cos(angle) * radius,
        y: this.pointer.y + Math.sin(angle) * radius,
      };
    });

    ctx.save();
    ctx.lineCap = "round";

    this.scene.particles.forEach((particle, index) => {
      const waveX = Math.sin(time * 0.5 + particle.phase) * 8;
      const waveY = Math.cos(time * 0.4 + particle.phase) * 7;
      let targetX = particle.baseX + waveX;
      let targetY = particle.baseY + waveY;

      const dx = this.pointer.x - particle.x;
      const dy = this.pointer.y - particle.y;
      const distance = Math.hypot(dx, dy);
      const influence = pointerStrength * ease(1 - distance / 190);
      if (influence > 0) {
        const node = nearNodes[index % nearNodes.length];
        targetX = lerp(targetX, node.x, influence * 0.88);
        targetY = lerp(targetY, node.y, influence * 0.88);
      }

      particle.x += (targetX - particle.x) * (0.035 + influence * 0.08);
      particle.y += (targetY - particle.y) * (0.035 + influence * 0.08);

      const alpha =
        (0.18 + particle.size * 0.045 + influence * 0.42 + modeFactor * 0.08) *
        lerp(particle.fade ?? 1, 1, influence);
      ctx.strokeStyle = this.color(particle.tint, clamp(alpha, 0.08, 0.82));
      ctx.fillStyle = this.color(particle.tint, clamp(alpha + 0.04, 0.1, 0.88));

      if (particle.kind === "dash") {
        const angle = particle.phase + time * 0.2;
        const length = particle.size * (2.2 + influence * 1.2);
        ctx.lineWidth = 1.15 + influence * 0.9;
        ctx.beginPath();
        ctx.moveTo(particle.x - Math.cos(angle) * length, particle.y - Math.sin(angle) * length);
        ctx.lineTo(particle.x + Math.cos(angle) * length, particle.y + Math.sin(angle) * length);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size + influence * 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    if (pointerStrength > 0.04) {
      ctx.strokeStyle = `rgba(124, 71, 40, ${0.22 * pointerStrength})`;
      ctx.lineWidth = 1;
      for (let i = 0; i < nearNodes.length; i += 1) {
        const a = nearNodes[i];
        const b = nearNodes[(i + 2) % nearNodes.length];
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

class ProjectVisualController {
  constructor(canvas, motion) {
    this.canvas = canvas;
    this.panel = canvas?.closest("[data-project-visual-panel]") || null;
    this.ctx = null;
    this.motion = motion;
    this.mode = "neuropath";
    this.width = 1;
    this.height = 1;
    this.dpr = 1;
    this.frame = 0;
    this.inView = false;
    this.active = false;
    this.scene = null;
    this.lastTime = 0;
    this.pointer = { x: 0, y: 0, prevX: 0, prevY: 0, vx: 1, vy: 0, active: false, strength: 0 };

    this.draw = this.draw.bind(this);
    this.resize = this.resize.bind(this);

    if (!this.canvas) {
      return;
    }
    this.ctx = this.canvas.getContext("2d");
    this.setupEvents();
    this.observe();
    this.motion.onChange(() => {
      this.resize();
      this.syncLoop();
    });
    window.addEventListener("resize", () => this.resize());
  }

  setupEvents() {
    const updatePointer = (event, rect) => {
      const nextX = event.clientX - rect.left;
      const nextY = event.clientY - rect.top;
      const moveX = nextX - this.pointer.x;
      const moveY = nextY - this.pointer.y;
      this.pointer.vx = lerp(this.pointer.vx, moveX, 0.48);
      this.pointer.vy = lerp(this.pointer.vy, moveY, 0.48);
      this.pointer.prevX = this.pointer.x;
      this.pointer.prevY = this.pointer.y;
      this.pointer.x = nextX;
      this.pointer.y = nextY;
      this.pointer.active = true;
    };

    this.canvas.addEventListener("pointerenter", (event) => {
      if (event.pointerType !== "touch" && !this.motion.reduced) {
        const rect = this.canvas.getBoundingClientRect();
        this.pointer.x = event.clientX - rect.left;
        this.pointer.y = event.clientY - rect.top;
        this.pointer.prevX = this.pointer.x;
        this.pointer.prevY = this.pointer.y;
        this.pointer.vx = 1;
        this.pointer.vy = 0;
        this.pointer.active = true;
      }
    });
    this.canvas.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch" || this.motion.reduced) {
        return;
      }
      const rect = this.canvas.getBoundingClientRect();
      updatePointer(event, rect);
    });
    this.canvas.addEventListener("pointerleave", () => {
      this.pointer.active = false;
    });
    const handleWindowMove = (event) => {
      if (event.pointerType === "touch" || this.motion.reduced || !this.active) {
        return;
      }
      const rect = this.canvas.getBoundingClientRect();
      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      if (inside) {
        updatePointer(event, rect);
      } else if (this.pointer.active) {
        this.pointer.active = false;
      }
    };
    window.addEventListener("pointermove", handleWindowMove, { passive: true });
    window.addEventListener("mousemove", handleWindowMove, { passive: true });
  }

  observe() {
    if (!this.panel) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        this.inView = entries.some((entry) => entry.isIntersecting);
        this.syncLoop();
      },
      { threshold: 0.1 }
    );
    observer.observe(this.panel);
  }

  setMode(mode) {
    this.mode = normalizeMode(mode);
    this.active = true;
    this.lastTime = 0;
    this.resize();
    this.syncLoop();
  }

  close() {
    this.active = false;
    this.pointer.active = false;
    this.syncLoop();
  }

  resize() {
    if (!this.canvas || !this.ctx) {
      return;
    }
    const rect = (this.panel || this.canvas).getBoundingClientRect();
    this.width = Math.max(1, Math.round(rect.width));
    this.height = Math.max(1, Math.round(rect.height));
    this.dpr = clamp(window.devicePixelRatio || 1, 1, 1.7);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.scene = this.buildScene();
    this.draw(0);
  }

  buildScene() {
    const rand = mulberry32(hashSeed(`${this.mode}-${this.width}-${this.height}`));
    if (this.mode === "kerr") {
      const rayCount = this.width < 520 ? 34 : 66;
      const rays = Array.from({ length: rayCount }, (_, index) => {
        const ray = {
          lane: index / Math.max(rayCount - 1, 1),
          tone: index % 5,
          trail: [],
          captured: false,
          captureAge: 0,
          phase: rand() * Math.PI * 2,
        };
        this.spawnKerrRay(ray, rand, true);
        return ray;
      });
      return {
        rays,
        rand,
        lens: { x: this.width * 0.6, y: this.height * 0.48 },
      };
    }
    if (this.mode === "motorproof") {
      const lanes = this.width < 520 ? 4 : 5;
      return {
        lanes,
        vehicles: Array.from({ length: this.width < 520 ? 22 : 42 }, (_, index) => ({
          lane: index % lanes,
          progress: rand(),
          speed: 0.14 + rand() * 0.045,
          targetSpeed: 1,
          length: 15 + rand() * 10,
          tone: index % 4,
          phase: rand() * Math.PI * 2,
          gapPush: 0,
        })),
      };
    }
    if (this.mode === "supplement") {
      const count = this.width < 520 ? 12 : 22;
      const items = Array.from({ length: count }, () => {
        const item = {};
        this.resetSupplementItem(item, rand, true);
        return item;
      });
      return {
        items,
        pulses: { evidence: 0, safe: 0, caution: 0 },
      };
    }
    return this.buildNeuroPathScene(rand);
  }

  buildNeuroPathScene(rand) {
    const compact = this.width < 520;
    const layout = compact
      ? [
          [0.24, 0.5, -0.08, 0.95],
          [0.52, 0.42, 0.06, 1.03],
          [0.79, 0.56, -0.03, 0.94],
        ]
      : [
          [0.22, 0.32, -0.06, 1.05],
          [0.5, 0.64, 0.1, 1.12],
          [0.78, 0.36, -0.05, 1.02],
        ];
    const neurons = layout.map(([x, y, angle, scale], index) => (
      this.buildNeuroPathNeuron(
        rand,
        clamp(x * this.width, 34, this.width - 34),
        clamp(y * this.height, 42, this.height - 42),
        angle,
        scale,
        index
      )
    ));
    const connectionPairs = compact
      ? [[0, 1], [1, 2]]
      : [[0, 1], [1, 2]];
    const connections = connectionPairs.map(([from, to], index) => (
      this.buildNeuroPathConnection(rand, neurons[from], neurons[to], from, to, index)
    ));
    return {
      neurons,
      connections,
      dynamicNeurons: [],
      dynamicConnections: [],
      relay: Array.from({ length: neurons.length }, () => 0),
      lastSpawnTime: -20,
      lastSpawnX: -999,
      lastSpawnY: -999,
      dust: Array.from({ length: compact ? 18 : 28 }, () => ({
        x: rand(),
        y: rand(),
        phase: rand() * Math.PI * 2,
        size: 0.42 + rand() * 0.82,
        tint: rand() > 0.9 ? "cool" : rand() > 0.62 ? "gold" : "copper",
      })),
    };
  }

  buildNeuroPathNeuron(rand, x, y, axonAngle, scale, index, profile = "static") {
    const dynamicProfile = profile === "dynamic";
    const size = (dynamicProfile ? 9 + rand() * 1.05 : 8.7 + rand() * 1.7) * scale;
    const compact = this.width < 520;
    const dendriteCount = dynamicProfile ? (compact ? 3 : 4) : (compact ? 5 : 7);
    const dendrites = Array.from({ length: dendriteCount }, (_, branchIndex) => {
      const fan = dendriteCount > 1 ? (branchIndex / (dendriteCount - 1) - 0.5) : 0;
      const fanSpread = dynamicProfile ? Math.PI * 0.92 : Math.PI * 1.82;
      const angle = axonAngle + Math.PI + fan * fanSpread + (rand() - 0.5) * (dynamicProfile ? 0.09 : 0.28);
      const length = (dynamicProfile ? 22 + rand() * 12 : 36 + rand() * 32) * scale;
      const startX = x + Math.cos(angle) * size * 0.96;
      const startY = y + Math.sin(angle) * size * 0.78;
      const endX = startX + Math.cos(angle) * length;
      const endY = startY + Math.sin(angle) * length;
      const bend = (rand() - 0.5) * length * (dynamicProfile ? 0.18 : 0.42);
      const curve = {
        x1: startX,
        y1: startY,
        cx: startX + Math.cos(angle) * length * 0.48 + Math.cos(angle + Math.PI * 0.5) * bend,
        cy: startY + Math.sin(angle) * length * 0.48 + Math.sin(angle + Math.PI * 0.5) * bend,
        x2: endX,
        y2: endY,
      };
      const forkCount = dynamicProfile ? 0 : (compact ? 1 : (rand() > 0.35 ? 2 : 1));
      const forks = Array.from({ length: forkCount }, (_, forkIndex) => {
        const at = dynamicProfile ? 0.52 + rand() * 0.24 : 0.38 + rand() * 0.38;
        const origin = this.curvePoint(curve, at);
        const forkAngle = angle + (forkIndex % 2 === 0 ? 1 : -1) * (0.34 + rand() * 0.26);
        const forkLength = (dynamicProfile ? 6 + rand() * 8 : 12 + rand() * 19) * scale;
        return {
          x1: origin.x,
          y1: origin.y,
          cx: origin.x + Math.cos(forkAngle) * forkLength * 0.46 + Math.cos(forkAngle + Math.PI * 0.5) * (rand() - 0.5) * (dynamicProfile ? 3 : 6),
          cy: origin.y + Math.sin(forkAngle) * forkLength * 0.46 + Math.sin(forkAngle + Math.PI * 0.5) * (rand() - 0.5) * (dynamicProfile ? 3 : 6),
          x2: origin.x + Math.cos(forkAngle) * forkLength,
          y2: origin.y + Math.sin(forkAngle) * forkLength,
          delay: (dynamicProfile ? 0.28 : 0.22) + branchIndex * 0.04 + forkIndex * 0.07 + rand() * 0.05,
        };
      });
      return {
        curve,
        forks,
        width: (dynamicProfile ? 0.66 : 0.64) + rand() * 0.16,
        delay: (dynamicProfile ? 0.08 : 0.04) + branchIndex * 0.042 + rand() * 0.04,
        phase: rand() * Math.PI * 2,
      };
    });
    const axonLength = Math.min(
      this.width * (dynamicProfile ? 0.18 : 0.34),
      (dynamicProfile ? 66 + rand() * 20 : 122 + rand() * 44) * scale
    );
    const axonBend = (rand() - 0.5) * (dynamicProfile ? 11 : 26);
    const axon = {
      x1: x + Math.cos(axonAngle) * size * 1.02,
      y1: y + Math.sin(axonAngle) * size * 0.84,
      cx: x + Math.cos(axonAngle) * axonLength * 0.56 + Math.cos(axonAngle + Math.PI * 0.5) * axonBend,
      cy: y + Math.sin(axonAngle) * axonLength * 0.56 + Math.sin(axonAngle + Math.PI * 0.5) * axonBend,
      x2: x + Math.cos(axonAngle) * axonLength,
      y2: y + Math.sin(axonAngle) * axonLength,
    };
    const terminalAngles = dynamicProfile ? [0.04] : [-0.34, -0.08, 0.18, 0.42];
    const terminals = terminalAngles.map((offset, terminalIndex) => {
      const base = this.curvePoint(axon, 0.86);
      const angle = axonAngle + offset + (rand() - 0.5) * 0.12;
      const length = (dynamicProfile ? 9 + rand() * 7 : 20 + rand() * 15) * scale;
      return {
        x1: base.x,
        y1: base.y,
        cx: base.x + Math.cos(angle) * length * 0.55 + Math.cos(angle + Math.PI * 0.5) * (rand() - 0.5) * (dynamicProfile ? 3 : 8),
        cy: base.y + Math.sin(angle) * length * 0.55 + Math.sin(angle + Math.PI * 0.5) * (rand() - 0.5) * (dynamicProfile ? 3 : 8),
        x2: base.x + Math.cos(angle) * length,
        y2: base.y + Math.sin(angle) * length,
        delay: (dynamicProfile ? 0.52 : 0.48) + terminalIndex * 0.05 + rand() * 0.07,
      };
    });
    const soma = Array.from({ length: 11 }, (_, pointIndex) => {
      const angle = (pointIndex / 11) * Math.PI * 2 + rand() * 0.05;
      return { angle, radius: 0.78 + rand() * 0.24 };
    });
    return {
      x,
      y,
      size,
      axonAngle,
      dendrites,
      axon,
      terminals,
      soma,
      phase: rand() * Math.PI * 2,
      lastTouched: -20,
      activity: 0,
      index,
      profile,
      connected: false,
    };
  }

  buildNeuroPathConnection(rand, fromNeuron, toNeuron, from, to, index) {
    const terminal = fromNeuron.terminals[index % fromNeuron.terminals.length];
    const dendrite = toNeuron.dendrites[(index * 2 + 1) % toNeuron.dendrites.length].curve;
    const target = this.curvePoint(dendrite, 0.72);
    return {
      from,
      to,
      phase: rand() * Math.PI * 2,
      lastTouched: -20,
      curve: {
        x1: terminal.x2,
        y1: terminal.y2,
        cx: (terminal.x2 + target.x) * 0.5,
        cy: (terminal.y2 + target.y) * 0.5 - 18 - index * 1.5,
        x2: target.x,
        y2: target.y,
      },
    };
  }

  neuroPathCurveTangent(curve, t) {
    const x =
      2 * (1 - t) * (curve.cx - curve.x1) +
      2 * t * (curve.x2 - curve.cx);
    const y =
      2 * (1 - t) * (curve.cy - curve.y1) +
      2 * t * (curve.y2 - curve.cy);
    const length = Math.max(1, Math.hypot(x, y));
    return { x: x / length, y: y / length };
  }

  neuroPathContactTargets(neuron) {
    const targets = [];
    neuron.dendrites.forEach((branch, branchIndex) => {
      [0.38, 0.56, 0.74].forEach((t, sampleIndex) => {
        const point = this.curvePoint(branch.curve, t);
        const tangent = this.neuroPathCurveTangent(branch.curve, t);
        targets.push({
          x: point.x,
          y: point.y,
          nx: -tangent.y,
          ny: tangent.x,
          dendrite: true,
          delay: branch.delay + t * 0.34,
          score: sampleIndex * 4 + branchIndex * 0.8,
        });
      });
      branch.forks.forEach((fork, forkIndex) => {
        const t = 0.72;
        const point = this.curvePoint(fork, t);
        const tangent = this.neuroPathCurveTangent(fork, t);
        targets.push({
          x: point.x,
          y: point.y,
          nx: -tangent.y,
          ny: tangent.x,
          dendrite: true,
          fork: true,
          delay: fork.delay + t * 0.24,
          score: 5 + forkIndex * 2 + branchIndex * 0.65,
        });
      });
    });
    targets.push({
      x: neuron.x + Math.cos(neuron.axonAngle + Math.PI * 0.75) * neuron.size * 1.05,
      y: neuron.y + Math.sin(neuron.axonAngle + Math.PI * 0.75) * neuron.size * 0.9,
      nx: Math.cos(neuron.axonAngle + Math.PI * 0.75),
      ny: Math.sin(neuron.axonAngle + Math.PI * 0.75),
      dendrite: false,
      soma: true,
      delay: 0.18,
      score: 45,
    });
    return targets;
  }

  buildNeuroPathDirectConnection(rand, fromNeuron, toNeuron, born, life) {
    const targets = this.neuroPathContactTargets(toNeuron);
    let terminal = fromNeuron.terminals[0];
    let target = targets[0];
    let bestScore = Infinity;
    fromNeuron.terminals.forEach((candidateTerminal) => {
      targets.forEach((candidateTarget) => {
        const distance = Math.hypot(candidateTarget.x - candidateTerminal.x2, candidateTarget.y - candidateTerminal.y2);
        const score = distance + candidateTarget.score + rand() * 16;
        if (score < bestScore) {
          bestScore = score;
          terminal = candidateTerminal;
          target = candidateTarget;
        }
      });
    });
    const terminalDistance = Math.hypot(target.x - terminal.x2, target.y - terminal.y2);
    if (terminalDistance > Math.min(this.width * 0.15, 145)) {
      return null;
    }
    const midX = (terminal.x2 + target.x) * 0.5;
    const midY = (terminal.y2 + target.y) * 0.5;
    const dx = target.x - terminal.x2;
    const dy = target.y - terminal.y2;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const bend = clamp(distance * 0.16, 10, 24) * (rand() > 0.5 ? 1 : -1);
    const readyDelay = Math.max(
      fromNeuron.dynamic ? (terminal.delay || 0.38) + 0.18 : 0,
      toNeuron.dynamic ? (target.delay || 0.18) + 0.08 : 0
    );
    return {
      fromNeuron,
      toNeuron,
      born,
      life,
      phase: rand() * Math.PI * 2,
      readyDelay,
      contact: {
        nx: target.nx,
        ny: target.ny,
        dendrite: target.dendrite,
        fork: target.fork,
        soma: target.soma,
      },
      curve: {
        x1: terminal.x2,
        y1: terminal.y2,
        cx: midX + (-dy / distance) * bend,
        cy: midY + (dx / distance) * bend,
        x2: target.x,
        y2: target.y,
      },
    };
  }

  spawnNeuroPathNeuron(time) {
    const scene = this.scene;
    if (!scene || this.pointer.strength < 0.03) {
      return;
    }
    const moved = Math.hypot(this.pointer.x - scene.lastSpawnX, this.pointer.y - scene.lastSpawnY);
    const compact = this.width < 520;
    const spawnDelay = compact ? 0.32 : 0.24;
    const spawnDistance = compact ? 38 : 40;
    const stationaryReady = time - scene.lastSpawnTime > (compact ? 0.72 : 0.62);
    if (time - scene.lastSpawnTime < spawnDelay || (moved < spawnDistance && !stationaryReady)) {
      return;
    }

    const rand = mulberry32(hashSeed(`neuro-dynamic-${Math.round(time * 8)}-${Math.round(this.pointer.x)}-${Math.round(this.pointer.y)}`));
    const velocityAngle = Math.atan2(this.pointer.vy, this.pointer.vx);
    const fallbackAngle = (rand() - 0.5) * 0.28;
    let axonAngle = Number.isFinite(velocityAngle) && Math.hypot(this.pointer.vx, this.pointer.vy) > 1.2
      ? velocityAngle * 0.58
      : fallbackAngle;
    const x = clamp(this.pointer.x + (rand() - 0.5) * 18, 52, this.width - 52);
    const y = clamp(this.pointer.y + (rand() - 0.5) * 18, 58, this.height - 58);
    const candidates = scene.dynamicNeurons.length
      ? scene.dynamicNeurons
      : scene.neurons;
    const nearby = [];
    const linkLimit = Math.min(this.width * 0.16, compact ? 106 : 138);
    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[i];
      const distance = Math.hypot(candidate.x - x, candidate.y - y);
      if (distance < linkLimit) {
        nearby.push({ candidate, distance });
      }
    }
    nearby.sort((a, b) => a.distance - b.distance);
    const linkedNeuron = nearby.length ? nearby[0].candidate : null;
    if (linkedNeuron) {
      axonAngle = Math.atan2(linkedNeuron.y - y, linkedNeuron.x - x) + (rand() - 0.5) * 0.16;
    }
    const neuron = this.buildNeuroPathNeuron(
      rand,
      x,
      y,
      axonAngle,
      0.92 + rand() * 0.15,
      scene.neurons.length + scene.dynamicNeurons.length,
      "dynamic"
    );
    neuron.born = time;
    neuron.life = 5.8 + rand() * 0.7;
    neuron.lastTouched = time;
    neuron.activity = 1;
    neuron.dynamic = true;
    neuron.connected = false;

    if (linkedNeuron) {
      const connection = this.buildNeuroPathDirectConnection(rand, neuron, linkedNeuron, time, neuron.life);
      if (connection) {
        neuron.connected = true;
        linkedNeuron.connected = true;
        scene.dynamicConnections.push(connection);
      }
    }

    scene.dynamicNeurons.push(neuron);
    const cap = compact ? 4 : 7;
    while (scene.dynamicNeurons.length > cap) {
      const removed = scene.dynamicNeurons.shift();
      scene.dynamicConnections = scene.dynamicConnections.filter((connection) => (
        connection.fromNeuron !== removed && connection.toNeuron !== removed
      ));
    }
    while (scene.dynamicConnections.length > cap) {
      scene.dynamicConnections.shift();
    }
    scene.lastSpawnTime = time;
    scene.lastSpawnX = this.pointer.x;
    scene.lastSpawnY = this.pointer.y;
  }

  shouldAnimate() {
    return this.active && this.inView && !document.hidden && !this.motion.reduced;
  }

  syncLoop() {
    if (this.shouldAnimate()) {
      if (!this.frame) {
        this.frame = window.requestAnimationFrame(this.draw);
      }
      return;
    }
    if (this.frame) {
      window.cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
    if (this.active) {
      this.draw(0);
    }
  }

  clearSurface(ctx) {
    ctx.clearRect(0, 0, this.width, this.height);
    const radial = ctx.createRadialGradient(
      this.width * 0.48,
      this.height * 0.48,
      0,
      this.width * 0.48,
      this.height * 0.48,
      Math.max(this.width, this.height) * 0.72
    );
    radial.addColorStop(0, "rgba(210, 161, 95, 0.06)");
    radial.addColorStop(0.58, "rgba(210, 161, 95, 0.015)");
    radial.addColorStop(1, "rgba(210, 161, 95, 0)");
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  draw(timeStamp = 0) {
    if (!this.ctx || !this.scene) {
      return;
    }
    const time = timeStamp * 0.001;
    const dt = this.lastTime ? clamp(time - this.lastTime, 0.001, 0.033) : 0.016;
    this.lastTime = time || this.lastTime;

    // phantom probe: while no pointer is present, the system runs its own
    // slow inspection pass so the stage is never inert
    const autonomous = this.mode === "neuropath" || this.mode === "supplement";
    if (!this.pointer.active && autonomous && !this.motion.reduced) {
      const phantomX = this.width * (0.5 + 0.33 * Math.sin(time * 0.21));
      const phantomY = this.height * (0.5 + 0.3 * Math.sin(time * 0.157 + 1.6));
      this.pointer.vx = lerp(this.pointer.vx, phantomX - this.pointer.x, 0.3);
      this.pointer.vy = lerp(this.pointer.vy, phantomY - this.pointer.y, 0.3);
      this.pointer.x = phantomX;
      this.pointer.y = phantomY;
    }
    const strengthTarget = this.pointer.active ? 1 : autonomous && !this.motion.reduced ? 0.4 : 0;
    this.pointer.strength += (strengthTarget - this.pointer.strength) * 0.08;

    const ctx = this.ctx;
    this.clearSurface(ctx);
    if (this.mode === "kerr") {
      this.drawKerr(ctx, time, dt);
    } else if (this.mode === "motorproof") {
      this.drawMotorProof(ctx, time, dt);
    } else if (this.mode === "supplement") {
      this.drawSupplement(ctx, time, dt);
    } else {
      this.drawNeuroPath(ctx, time, dt);
    }
    if (this.frame) {
      this.frame = window.requestAnimationFrame(this.draw);
    }
  }

  tint(tint, alpha) {
    if (tint === "cool") {
      return `rgba(111, 147, 155, ${alpha})`;
    }
    if (tint === "gold") {
      return `rgba(210, 161, 95, ${alpha})`;
    }
    return `rgba(157, 91, 50, ${alpha})`;
  }

  curvePoint(curve, amount) {
    const t = clamp(amount, 0, 1);
    const inv = 1 - t;
    return {
      x: inv * inv * curve.x1 + 2 * inv * t * curve.cx + t * t * curve.x2,
      y: inv * inv * curve.y1 + 2 * inv * t * curve.cy + t * t * curve.y2,
    };
  }

  drawCurveSegment(ctx, curve, amount, steps = 12) {
    const end = clamp(amount, 0, 1);
    if (end <= 0.002) {
      return;
    }
    const count = Math.max(1, Math.ceil(steps * end));
    ctx.beginPath();
    ctx.moveTo(curve.x1, curve.y1);
    for (let step = 1; step <= count; step += 1) {
      const t = (step / count) * end;
      const inv = 1 - t;
      ctx.lineTo(
        inv * inv * curve.x1 + 2 * inv * t * curve.cx + t * t * curve.x2,
        inv * inv * curve.y1 + 2 * inv * t * curve.cy + t * t * curve.y2
      );
    }
    ctx.stroke();
  }

  drawNeuroPath(ctx, time) {
    const scene = this.scene;
    const pointerActive = this.pointer.strength > 0.018;
    const linger = 7.2;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (let i = 0; i < scene.dust.length; i += 1) {
      const dust = scene.dust[i];
      const x = dust.x * this.width + Math.sin(time * 0.16 + dust.phase) * 4;
      const y = dust.y * this.height + Math.cos(time * 0.14 + dust.phase) * 3;
      const near = pointerActive ? ease(1 - Math.hypot(this.pointer.x - x, this.pointer.y - y) / 160) : 0;
      ctx.fillStyle = this.tint(dust.tint, 0.034 + near * 0.05);
      ctx.beginPath();
      ctx.arc(x, y, dust.size + near * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }

    this.spawnNeuroPathNeuron(time);

    for (let i = scene.dynamicNeurons.length - 1; i >= 0; i -= 1) {
      const neuron = scene.dynamicNeurons[i];
      if (time - neuron.born > neuron.life) {
        scene.dynamicNeurons.splice(i, 1);
      }
    }
    const liveDynamicNeurons = new Set(scene.dynamicNeurons);
    for (let i = scene.dynamicConnections.length - 1; i >= 0; i -= 1) {
      const connection = scene.dynamicConnections[i];
      const missingFrom = connection.fromNeuron?.dynamic && !liveDynamicNeurons.has(connection.fromNeuron);
      const missingTo = connection.toNeuron?.dynamic && !liveDynamicNeurons.has(connection.toNeuron);
      if (time - connection.born > connection.life || missingFrom || missingTo) {
        scene.dynamicConnections.splice(i, 1);
      }
    }

    const allNeurons = scene.neurons.concat(scene.dynamicNeurons);
    const dynamicLayerActive = scene.dynamicNeurons.length > 0;

    for (let i = 0; i < scene.relay.length; i += 1) {
      scene.relay[i] = 0;
    }

    for (let i = 0; i < allNeurons.length; i += 1) {
      const neuron = allNeurons[i];
      const localDirect = pointerActive
        ? ease(1 - Math.hypot(this.pointer.x - neuron.x, this.pointer.y - neuron.y) / 220) * this.pointer.strength
        : 0;
      const direct = neuron.dynamic
        ? localDirect
        : Math.max(localDirect, pointerActive ? this.pointer.strength * 0.28 : 0);
      if (direct > 0.015) {
        neuron.lastTouched = time;
      }
      const held = neuron.dynamic
        ? ease(1 - (time - neuron.born) / neuron.life)
        : ease(1 - (time - neuron.lastTouched) / linger);
      const target = neuron.dynamic
        ? Math.max(direct, held * 0.82)
        : Math.max(direct, held * 0.86);
      neuron.activity = lerp(neuron.activity, target, 0.24);
    }

    for (let i = 0; i < scene.connections.length; i += 1) {
      const connection = scene.connections[i];
      const fromActivity = scene.neurons[connection.from].activity;
      const toActivity = scene.neurons[connection.to].activity;
      if (fromActivity > 0.12 || toActivity > 0.18) {
        connection.lastTouched = time;
        scene.relay[connection.to] = Math.max(scene.relay[connection.to], fromActivity * 0.46);
      }
    }

    for (let i = 0; i < scene.neurons.length; i += 1) {
      const neuron = scene.neurons[i];
      neuron.activity = Math.max(neuron.activity, scene.relay[i]);
    }

    for (let i = 0; i < scene.connections.length; i += 1) {
      const connection = scene.connections[i];
      const fromActivity = scene.neurons[connection.from].activity;
      const toActivity = scene.neurons[connection.to].activity;
      const held = ease(1 - (time - connection.lastTouched) / linger);
      const alpha = (0.04 + Math.max(fromActivity, toActivity, held) * 0.18) * (dynamicLayerActive ? 0.32 : 1);
      if (alpha < 0.024) {
        continue;
      }
      ctx.strokeStyle = `rgba(123, 71, 41, ${alpha})`;
      ctx.lineWidth = 0.38 + alpha * 0.64;
      ctx.beginPath();
      ctx.moveTo(connection.curve.x1, connection.curve.y1);
      ctx.quadraticCurveTo(connection.curve.cx, connection.curve.cy, connection.curve.x2, connection.curve.y2);
      ctx.stroke();

      const pulseAlpha = Math.max(fromActivity, held) * 0.72;
      if (pulseAlpha > 0.04) {
        const pulse = this.curvePoint(connection.curve, (time * 0.24 + connection.phase) % 1);
        ctx.fillStyle = `rgba(111, 147, 155, ${0.08 + pulseAlpha * 0.38})`;
        ctx.beginPath();
        ctx.arc(pulse.x, pulse.y, 0.95 + pulseAlpha * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (let i = 0; i < scene.dynamicConnections.length; i += 1) {
      const connection = scene.dynamicConnections[i];
      const ageSeconds = time - connection.born;
      const age = clamp(ageSeconds / connection.life, 0, 1);
      const readyAge = ageSeconds - (connection.readyDelay || 0);
      if (readyAge <= -0.02) {
        continue;
      }
      const grow = ease(readyAge / 0.46);
      const lifeAlpha = ease(clamp((connection.life - ageSeconds) / 1.35, 0, 1));
      const fromActivity = connection.fromNeuron.activity || 0;
      const toActivity = connection.toNeuron.activity || 0;
      const alpha = grow * lifeAlpha * (0.18 + Math.max(fromActivity, toActivity) * 0.36);
      if (alpha < 0.018) {
        continue;
      }
      ctx.strokeStyle = `rgba(123, 71, 41, ${alpha})`;
      ctx.lineWidth = 0.64 + alpha * 0.9;
      this.drawCurveSegment(ctx, connection.curve, grow, 14);

      if (grow > 0.72) {
        const endpointAlpha = lifeAlpha * grow * 0.26;
        ctx.fillStyle = `rgba(157, 91, 50, ${endpointAlpha})`;
        ctx.beginPath();
        ctx.arc(connection.curve.x1, connection.curve.y1, 1.3, 0, Math.PI * 2);
        ctx.arc(connection.curve.x2, connection.curve.y2, connection.contact?.dendrite ? 1.18 : 1.05, 0, Math.PI * 2);
        ctx.fill();
      }

      const pulseAlpha = lifeAlpha * (0.24 + Math.max(fromActivity, toActivity) * 0.32);
      const pulseOffsets = [0];
      for (let pulseIndex = 0; pulseIndex < pulseOffsets.length; pulseIndex += 1) {
        const pulseT = ((readyAge * 0.76) + connection.phase * 0.08 + pulseOffsets[pulseIndex]) % 1;
        if (pulseT < grow && pulseT > 0.04) {
          const pulse = this.curvePoint(connection.curve, pulseT);
          ctx.fillStyle = `rgba(111, 147, 155, ${pulseAlpha * 0.16})`;
          ctx.beginPath();
          ctx.arc(pulse.x, pulse.y, 3.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `rgba(255, 232, 190, ${pulseAlpha})`;
          ctx.beginPath();
          ctx.arc(pulse.x, pulse.y, 1.15 + pulseAlpha * 0.24, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    for (let i = 0; i < allNeurons.length; i += 1) {
      const neuron = allNeurons[i];
      const ageSeconds = neuron.dynamic ? time - neuron.born : 8;
      const lifeAlpha = neuron.dynamic ? ease(clamp((neuron.life - ageSeconds) / 1.35, 0, 1)) : 1;
      const somaGrow = neuron.dynamic ? ease(ageSeconds / 0.22) : 1;
      const axonGrow = neuron.dynamic ? ease((ageSeconds - 0.18) / 0.58) : 1;
      const activity = clamp(neuron.activity, 0, 1) * lifeAlpha;
      const layerAlpha = neuron.dynamic || !dynamicLayerActive ? 1 : 0.3;
      const branchAlpha = neuron.dynamic
        ? (0.2 + activity * 0.24) * lifeAlpha
        : (0.055 + activity * 0.14) * lifeAlpha * layerAlpha;
      const fineAlpha = neuron.dynamic
        ? (0.09 + activity * 0.14) * lifeAlpha
        : (0.025 + activity * 0.08) * lifeAlpha * layerAlpha;

      for (let branchIndex = 0; branchIndex < neuron.dendrites.length; branchIndex += 1) {
        const branch = neuron.dendrites[branchIndex];
        const branchGrow = neuron.dynamic ? ease((ageSeconds - branch.delay) / 0.48) : 1;
        if (branchGrow <= 0.01) {
          continue;
        }
        ctx.strokeStyle = `rgba(123, 71, 41, ${branchAlpha * branchGrow})`;
        ctx.lineWidth = branch.width * (neuron.dynamic ? 1.12 : 0.84) + activity * 0.12;
        this.drawCurveSegment(ctx, branch.curve, branchGrow, 11);

        if (neuron.dynamic && branchGrow < 0.98) {
          const tip = this.curvePoint(branch.curve, branchGrow);
          ctx.fillStyle = `rgba(210, 161, 95, ${0.22 + activity * 0.34})`;
          ctx.beginPath();
          ctx.arc(tip.x, tip.y, 1.35, 0, Math.PI * 2);
          ctx.fill();
        }

        for (let forkIndex = 0; forkIndex < branch.forks.length; forkIndex += 1) {
          const fork = branch.forks[forkIndex];
          const forkGrow = neuron.dynamic ? ease((ageSeconds - fork.delay) / 0.38) : 1;
          if (forkGrow <= 0.01) {
            continue;
          }
          ctx.strokeStyle = `rgba(123, 71, 41, ${fineAlpha * forkGrow})`;
          ctx.lineWidth = (neuron.dynamic ? 0.44 : 0.32) + activity * 0.07;
          this.drawCurveSegment(ctx, fork, forkGrow, 8);
        }

        if (activity > 0.42 && branchGrow > 0.82) {
          const inward = ((ageSeconds * 0.56) + branch.phase * 0.11) % 1;
          const pulseT = clamp(branchGrow * (1 - inward), 0.06, branchGrow);
          const branchPulse = this.curvePoint(branch.curve, pulseT);
          const branchPulseAlpha = (0.12 + activity * 0.2) * lifeAlpha * branchGrow;
          ctx.fillStyle = `rgba(111, 147, 155, ${branchPulseAlpha * 0.12})`;
          ctx.beginPath();
          ctx.arc(branchPulse.x, branchPulse.y, 2.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `rgba(255, 232, 190, ${branchPulseAlpha})`;
          ctx.beginPath();
          ctx.arc(branchPulse.x, branchPulse.y, 0.8 + branchPulseAlpha * 0.18, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const axonAlpha = neuron.dynamic
        ? (0.18 + activity * 0.26) * lifeAlpha * axonGrow * (neuron.connected ? 1 : 0.58)
        : (0.07 + activity * 0.16) * lifeAlpha * layerAlpha;
      ctx.strokeStyle = `rgba(157, 91, 50, ${axonAlpha})`;
      ctx.lineWidth = neuron.dynamic ? 0.88 + activity * 0.18 : 0.5 + activity * 0.1;
      this.drawCurveSegment(ctx, neuron.axon, axonGrow, 16);

      if (!neuron.dynamic || neuron.connected) {
        for (let terminalIndex = 0; terminalIndex < neuron.terminals.length; terminalIndex += 1) {
          const terminal = neuron.terminals[terminalIndex];
          const terminalGrow = neuron.dynamic ? ease((ageSeconds - terminal.delay) / 0.34) : 1;
          if (terminalGrow <= 0.01) {
            continue;
          }
          ctx.strokeStyle = `rgba(157, 91, 50, ${(0.055 + activity * 0.13) * terminalGrow * lifeAlpha})`;
          ctx.lineWidth = (neuron.dynamic ? 0.42 : 0.36) + activity * 0.06;
          this.drawCurveSegment(ctx, terminal, terminalGrow, 8);
          ctx.fillStyle = `rgba(210, 161, 95, ${(0.065 + activity * 0.15) * terminalGrow * lifeAlpha})`;
          ctx.beginPath();
          ctx.arc(terminal.x2, terminal.y2, neuron.dynamic ? 0.92 + activity * 0.24 : 0.72 + activity * 0.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (activity > 0.04 && axonGrow > 0.28 && (!neuron.dynamic || neuron.connected)) {
        const axonPulseOffsets = [0];
        for (let pulseIndex = 0; pulseIndex < axonPulseOffsets.length; pulseIndex += 1) {
          const pulseT = neuron.dynamic
            ? ((ageSeconds * 0.88 + axonPulseOffsets[pulseIndex] + neuron.phase * 0.06) % 1)
            : ((time * 0.28 + neuron.phase) % 1);
          if (!neuron.dynamic || pulseT < axonGrow) {
            const axonPulse = this.curvePoint(neuron.axon, pulseT);
            const pulseAlpha = neuron.dynamic ? (0.24 + activity * 0.32) * lifeAlpha : (0.18 + activity * 0.28);
            ctx.fillStyle = `rgba(111, 147, 155, ${pulseAlpha * 0.16})`;
            ctx.beginPath();
            ctx.arc(axonPulse.x, axonPulse.y, neuron.dynamic ? 3.4 : 2.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = `rgba(255, 232, 190, ${pulseAlpha})`;
            ctx.beginPath();
            ctx.arc(axonPulse.x, axonPulse.y, neuron.dynamic ? 1.12 + pulseAlpha * 0.22 : 0.92 + activity * 0.3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      const somaFillAlpha = neuron.dynamic ? 0.28 + activity * 0.15 : (0.06 + activity * 0.055) * layerAlpha;
      const somaStrokeAlpha = neuron.dynamic ? 0.24 + activity * 0.22 : (0.055 + activity * 0.075) * layerAlpha;
      ctx.fillStyle = `rgba(255, 248, 238, ${somaFillAlpha * somaGrow * lifeAlpha})`;
      ctx.strokeStyle = `rgba(157, 91, 50, ${somaStrokeAlpha * lifeAlpha * somaGrow})`;
      ctx.lineWidth = (neuron.dynamic ? 0.95 : 0.42) + activity * 0.11;
      ctx.beginPath();
      for (let pointIndex = 0; pointIndex < neuron.soma.length; pointIndex += 1) {
        const point = neuron.soma[pointIndex];
        const x = neuron.x + Math.cos(point.angle) * neuron.size * point.radius * somaGrow;
        const y = neuron.y + Math.sin(point.angle) * neuron.size * point.radius * somaGrow;
        if (pointIndex === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = neuron.dynamic
        ? `rgba(111, 147, 155, ${(0.2 + activity * 0.32) * lifeAlpha})`
        : `rgba(111, 147, 155, ${0.02 + activity * 0.055})`;
      ctx.beginPath();
      ctx.arc(
        neuron.x + Math.cos(neuron.axonAngle + 0.65) * neuron.size * 0.2,
        neuron.y + Math.sin(neuron.axonAngle + 0.65) * neuron.size * 0.2,
        neuron.dynamic ? 1.55 + activity * 0.38 : 0.4 + activity * 0.14,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    ctx.restore();
  }

  spawnKerrRay(ray, rand = Math.random, distribute = false) {
    const speed = 125 + rand() * 75;
    const angle = (rand() - 0.5) * 0.1;
    ray.x = distribute
      ? lerp(-this.width * 0.05, this.width * 1.02, rand())
      : -28 - rand() * 110;
    ray.y = this.height * (0.03 + 0.94 * rand());
    ray.vx = Math.cos(angle) * speed;
    ray.vy = Math.sin(angle) * speed;
    ray.speed = speed;
    ray.trail.length = 0;
    ray.captured = false;
    ray.captureAge = 0;
    ray.captureOffsetX = 0;
    ray.captureOffsetY = 0;
    ray.brightness = 0.45 + rand() * 0.55;
  }

  drawKerr(ctx, time, dt) {
    // Null-geodesic-flavoured lensing: photons keep constant speed, the
    // lens bends their direction with a 1/r^2 field. Far rays deflect
    // slightly, close rays whip around, the closest plunge and are captured.
    const scene = this.scene;
    const pointerStrength = this.pointer.strength;
    const targetX = this.pointer.active
      ? this.pointer.x
      : this.width * (0.6 + Math.sin(time * 0.09) * 0.07);
    const targetY = this.pointer.active
      ? this.pointer.y
      : this.height * (0.46 + Math.sin(time * 0.127 + 1.2) * 0.1);
    const follow = 1 - Math.exp(-dt * (this.pointer.active ? 14 : 2.2));
    scene.lens.x = lerp(scene.lens.x, targetX, follow);
    scene.lens.y = lerp(scene.lens.y, targetY, follow);
    const lensX = scene.lens.x;
    const lensY = scene.lens.y;
    const mass = (this.width < 520 ? 5e5 : 7.6e5) * (0.42 + pointerStrength * 0.85);
    const captureRadius = 9 + pointerStrength * 8;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // light gathering around the lens — a soft warm halo, nothing drawn
    const halo = ctx.createRadialGradient(lensX, lensY, 0, lensX, lensY, 140);
    halo.addColorStop(0, `rgba(210, 161, 95, ${0.045 + pointerStrength * 0.07})`);
    halo.addColorStop(1, "rgba(210, 161, 95, 0)");
    ctx.fillStyle = halo;
    ctx.fillRect(lensX - 140, lensY - 140, 280, 280);

    scene.rays.forEach((ray) => {
      if (ray.captured) {
        // plunge: the offset from the lens collapses exponentially
        ray.captureAge += dt;
        const collapse = Math.exp(-dt * 7.5);
        ray.captureOffsetX *= collapse;
        ray.captureOffsetY *= collapse;
        ray.x = lensX + ray.captureOffsetX;
        ray.y = lensY + ray.captureOffsetY;
      } else {
        const steps = 3;
        const h = dt / steps;
        for (let step = 0; step < steps; step += 1) {
          const dx = lensX - ray.x;
          const dy = lensY - ray.y;
          const r2 = dx * dx + dy * dy;
          const r = Math.sqrt(r2);
          if (r < captureRadius && pointerStrength > 0.18) {
            ray.captured = true;
            ray.captureAge = 0;
            ray.captureOffsetX = ray.x - lensX;
            ray.captureOffsetY = ray.y - lensY;
            break;
          }
          const a = mass / Math.max(r2, 520);
          const inv = 1 / Math.max(r, 1);
          ray.vx += dx * inv * a * h;
          ray.vy += dy * inv * a * h;
          const vNorm = Math.max(1, Math.hypot(ray.vx, ray.vy));
          ray.vx = (ray.vx / vNorm) * ray.speed;
          ray.vy = (ray.vy / vNorm) * ray.speed;
          ray.x += ray.vx * h;
          ray.y += ray.vy * h;
        }
      }

      ray.trail.push({ x: ray.x, y: ray.y });
      if (ray.trail.length > 62) {
        ray.trail.shift();
      }
      if (
        ray.x > this.width + 70 ||
        ray.x < -this.width * 0.24 - 90 ||
        ray.y < -90 ||
        ray.y > this.height + 90 ||
        ray.captureAge > 0.55
      ) {
        this.spawnKerrRay(ray, Math.random, false);
      }

      if (ray.trail.length < 2) {
        return;
      }
      const tailAlpha = ray.captured ? Math.max(0, 1 - ray.captureAge / 0.55) : 1;
      ctx.beginPath();
      ctx.moveTo(ray.trail[0].x, ray.trail[0].y);
      for (let i = 1; i < ray.trail.length; i += 1) {
        ctx.lineTo(ray.trail[i].x, ray.trail[i].y);
      }
      ctx.strokeStyle = ray.tone === 2
        ? `rgba(111, 147, 155, ${0.4 * ray.brightness * tailAlpha})`
        : ray.tone === 1
        ? `rgba(157, 91, 50, ${0.66 * ray.brightness * tailAlpha})`
        : `rgba(210, 161, 95, ${0.74 * ray.brightness * tailAlpha})`;
      ctx.lineWidth = ray.tone === 0 ? 2.2 : 1.4 + (ray.tone % 2) * 0.35;
      ctx.stroke();

      ctx.fillStyle = ray.tone === 2
        ? `rgba(111, 147, 155, ${0.42 * tailAlpha})`
        : `rgba(255, 231, 187, ${0.5 * tailAlpha})`;
      ctx.beginPath();
      ctx.arc(ray.x, ray.y, ray.captured ? 1.4 : 1.9, 0, Math.PI * 2);
      ctx.fill();
    });

    // the shadow: a small dark core, only while the lens is engaged
    if (pointerStrength > 0.12) {
      ctx.fillStyle = `rgba(30, 17, 7, ${0.55 * pointerStrength})`;
      ctx.beginPath();
      ctx.arc(lensX, lensY, 3 + pointerStrength * 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  laneY(lane) {
    const count = this.scene.lanes;
    const gap = clamp(this.height * 0.16, 34, 100);
    const center = this.height * 0.5;
    return center + (lane - (count - 1) / 2) * gap;
  }

  motorLanePosition(lane, progress) {
    const y = this.laneY(lane);
    const x = lerp(this.width * 0.05, this.width * 0.96, progress);
    return { x, y };
  }

  drawMotorProof(ctx, time, dt) {
    const inspectionX = this.width * 0.5;
    const pointerActive = this.pointer.active && this.pointer.strength > 0.04;
    const laneGap = this.scene.lanes > 1 ? this.laneY(1) - this.laneY(0) : 54;
    const roadTop = this.laneY(0) - laneGap * 0.48;
    const roadBottom = this.laneY(this.scene.lanes - 1) + laneGap * 0.48;
    const roadStart = this.width * 0.05;
    const roadEnd = this.width * 0.96;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const gateGlow = pointerActive
      ? ease(1 - Math.hypot(this.pointer.x - inspectionX, this.pointer.y - this.height * 0.5) / 190) * this.pointer.strength
      : 0;
    if (gateGlow > 0.02) {
      const glow = ctx.createRadialGradient(inspectionX, this.height * 0.5, 0, inspectionX, this.height * 0.5, 130);
      glow.addColorStop(0, `rgba(210, 161, 95, ${0.14 * gateGlow})`);
      glow.addColorStop(1, "rgba(210, 161, 95, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(inspectionX - 130, this.height * 0.5 - 130, 260, 260);
    }

    ctx.strokeStyle = "rgba(45, 27, 18, 0.2)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(roadStart, roadTop);
    ctx.lineTo(roadEnd, roadTop);
    ctx.moveTo(roadStart, roadBottom);
    ctx.lineTo(roadEnd, roadBottom);
    ctx.stroke();

    for (let boundary = 1; boundary < this.scene.lanes; boundary += 1) {
      const y = (this.laneY(boundary - 1) + this.laneY(boundary)) / 2;
      ctx.strokeStyle = "rgba(210, 161, 95, 0.23)";
      ctx.lineWidth = 1.1;
      ctx.setLineDash([13, 17]);
      ctx.beginPath();
      ctx.moveTo(roadStart + 18, y);
      ctx.lineTo(roadEnd - 18, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (let lane = 0; lane < this.scene.lanes; lane += 1) {
      const y = this.laneY(lane);
      ctx.strokeStyle = "rgba(123, 71, 41, 0.075)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(roadStart, y);
      ctx.lineTo(roadEnd, y);
      ctx.stroke();
    }

    const byLane = Array.from({ length: this.scene.lanes }, () => []);
    this.scene.vehicles.forEach((vehicle) => byLane[vehicle.lane].push(vehicle));
    byLane.forEach((laneVehicles) => laneVehicles.sort((a, b) => a.progress - b.progress));

    this.scene.vehicles.forEach((vehicle) => {
      const current = this.motorLanePosition(vehicle.lane, vehicle.progress);
      const laneDistance = pointerActive ? Math.abs(this.pointer.y - current.y) : 9999;
      const xDistance = pointerActive ? Math.abs(this.pointer.x - current.x) : 9999;
      const localSlow = pointerActive ? ease(1 - Math.hypot(xDistance, laneDistance * 1.7) / 155) : 0;
      const laneVehicles = byLane[vehicle.lane];
      const index = laneVehicles.indexOf(vehicle);
      const ahead = laneVehicles[(index + 1) % laneVehicles.length];
      let spacingSlow = 0;
      if (ahead && ahead !== vehicle) {
        const gap = ahead.progress > vehicle.progress
          ? ahead.progress - vehicle.progress
          : ahead.progress + 1 - vehicle.progress;
        spacingSlow = ease(1 - gap / 0.055) * 0.35;
      }
      const target = clamp(1 - localSlow * 0.88 - spacingSlow, 0.08, 1.08);
      vehicle.targetSpeed += (target - vehicle.targetSpeed) * 0.12;
      vehicle.progress = (vehicle.progress + vehicle.speed * vehicle.targetSpeed * dt) % 1;
      vehicle.gapPush += (localSlow - vehicle.gapPush) * 0.1;

      const point = this.motorLanePosition(vehicle.lane, vehicle.progress - vehicle.gapPush * 0.006);
      ctx.save();
      ctx.translate(point.x, point.y);
      const carWidth = vehicle.length;
      const carHeight = Math.min(8, laneGap * 0.18);
      ctx.fillStyle = vehicle.tone === 2
        ? "rgba(111, 147, 155, 0.46)"
        : vehicle.tone === 1
        ? "rgba(157, 91, 50, 0.68)"
        : "rgba(45, 27, 18, 0.56)";
      ctx.beginPath();
      ctx.roundRect(-carWidth * 0.5, -carHeight * 0.5, carWidth, carHeight, 2.5);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 248, 238, 0.38)";
      ctx.fillRect(-carWidth * 0.2, -carHeight * 0.5, carWidth * 0.16, carHeight);
      ctx.restore();
    });
    ctx.restore();
  }

  resetSupplementItem(item, rand = Math.random, distribute = false) {
    item.kind = rand() > 0.34 ? "capsule" : "doc";
    item.x = distribute ? this.width * rand() * 0.62 : -26 - rand() * 70;
    item.baseY = this.height * (0.1 + rand() * 0.8);
    item.y = item.baseY;
    item.speed = 15 + rand() * 14;
    item.phase = rand() * Math.PI * 2;
    item.state = "drift";
    item.t = 0;
    item.rot = (rand() - 0.5) * 0.6;
    item.dest = null;
  }

  supplementLanes() {
    return [
      { id: "evidence", kind: "doc", x: this.width * 0.82, y: this.height * 0.17 },
      { id: "safe", kind: "shield", x: this.width * 0.85, y: this.height * 0.52 },
      { id: "caution", kind: "warning", x: this.width * 0.78, y: this.height * 0.86 },
    ];
  }

  drawSupplement(ctx, time, dt) {
    // intake items drift in from the left; the probe acts as a triage gate
    // that routes each one along a path to evidence, safety, or caution
    const scene = this.scene;
    const strength = this.pointer.strength;
    const lanes = this.supplementLanes();
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    lanes.forEach((lane) => {
      const pulse = scene.pulses[lane.id] || 0;
      scene.pulses[lane.id] = pulse * Math.exp(-dt * 2.6);
      const alpha = 0.42 + pulse * 0.45;
      this.drawSupplementSymbol(ctx, lane.kind, lane.x, lane.y, alpha, 1.3 + pulse * 0.1, 0);
      if (lane.id === "safe") {
        this.drawSupplementSymbol(ctx, "check", lane.x, lane.y - 1, alpha * 0.9, 0.6, 0);
      }
      ctx.strokeStyle = `rgba(111, 58, 26, ${0.18 + pulse * 0.24})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lane.x - 36, lane.y);
      ctx.lineTo(lane.x - 23, lane.y);
      ctx.stroke();
    });

    // triage reticle: four rotating crop ticks around the probe
    if (strength > 0.05) {
      const radius = 24;
      ctx.strokeStyle = `rgba(156, 81, 38, ${0.34 * strength})`;
      ctx.lineWidth = 1.1;
      const spin = time * 0.5;
      for (let i = 0; i < 4; i += 1) {
        const angle = spin + (Math.PI / 2) * i;
        ctx.beginPath();
        ctx.moveTo(
          this.pointer.x + Math.cos(angle) * radius,
          this.pointer.y + Math.sin(angle) * radius
        );
        ctx.lineTo(
          this.pointer.x + Math.cos(angle) * (radius + 7),
          this.pointer.y + Math.sin(angle) * (radius + 7)
        );
        ctx.stroke();
      }
    }

    scene.items.forEach((item) => {
      if (item.state === "drift") {
        item.x += item.speed * dt;
        item.y = item.baseY + Math.sin(time * 0.5 + item.phase) * 7;
        if (item.x > this.width + 30) {
          this.resetSupplementItem(item);
        }
        const distance = Math.hypot(this.pointer.x - item.x, this.pointer.y - item.y);
        if (strength > 0.07 && distance < 120 && item.x < this.width * 0.72) {
          item.state = "triage";
          item.t = 0;
          item.fromX = item.x;
          item.fromY = item.y;
        }
        // short direction tail — reads as steady intake flow
        ctx.strokeStyle = "rgba(123, 71, 41, 0.14)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(item.x - 24, item.y);
        ctx.lineTo(item.x - 13, item.y);
        ctx.stroke();
      } else if (item.state === "triage") {
        item.t = Math.min(1, item.t + dt / 0.55);
        const k = ease(item.t);
        item.x = lerp(item.fromX, this.pointer.x + Math.cos(item.phase) * 16, k);
        item.y = lerp(item.fromY, this.pointer.y + Math.sin(item.phase) * 14, k);
        if (item.t >= 1) {
          const roll = (Math.sin(item.phase * 12.9898) + 1) / 2;
          item.dest = item.kind === "doc"
            ? "evidence"
            : roll > 0.8
            ? "caution"
            : roll > 0.62
            ? "evidence"
            : "safe";
          const lane = lanes.find((entry) => entry.id === item.dest);
          item.state = "route";
          item.t = 0;
          item.fromX = item.x;
          item.fromY = item.y;
          const dx = lane.x - item.x;
          const dy = lane.y - item.y;
          const norm = Math.max(1, Math.hypot(dx, dy));
          const bow = clamp(norm * 0.22, 16, 50) * (item.phase > Math.PI ? 1 : -1);
          item.ctrlX = (item.x + lane.x) / 2 + (-dy / norm) * bow;
          item.ctrlY = (item.y + lane.y) / 2 + (dx / norm) * bow;
          item.duration = 1.15 + (item.phase % 1) * 0.5;
        }
      } else if (item.state === "route") {
        item.t = Math.min(1, item.t + dt / item.duration);
        const lane = lanes.find((entry) => entry.id === item.dest);
        const k = ease(item.t);
        const inv = 1 - k;
        item.x = inv * inv * item.fromX + 2 * inv * k * item.ctrlX + k * k * lane.x;
        item.y = inv * inv * item.fromY + 2 * inv * k * item.ctrlY + k * k * lane.y;

        const pathAlpha = Math.sin(item.t * Math.PI) * 0.22;
        if (pathAlpha > 0.01) {
          ctx.strokeStyle = item.dest === "caution"
            ? `rgba(146, 90, 53, ${pathAlpha})`
            : item.dest === "evidence"
            ? `rgba(111, 147, 155, ${pathAlpha})`
            : `rgba(156, 81, 38, ${pathAlpha})`;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 8]);
          ctx.lineDashOffset = -time * 26;
          ctx.beginPath();
          ctx.moveTo(item.fromX, item.fromY);
          ctx.quadraticCurveTo(item.ctrlX, item.ctrlY, lane.x, lane.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        if (item.t >= 1) {
          scene.pulses[item.dest] = 1;
          this.resetSupplementItem(item);
          return;
        }
      }

      const baseAlpha = item.state === "drift" ? 0.46 : 0.72;
      const fade = item.state === "route" ? 1 - ease(Math.max(0, item.t - 0.86) / 0.14) : 1;
      this.drawSupplementSymbol(
        ctx,
        item.kind,
        item.x,
        item.y,
        baseAlpha * fade,
        item.state === "drift" ? 0.95 : 1.05,
        item.rot + Math.sin(time * 0.4 + item.phase) * 0.08
      );
    });
    ctx.restore();
  }

  drawSupplementSymbol(ctx, type, x, y, alpha, scale = 1, angle = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    ctx.strokeStyle =
      type === "warning"
        ? `rgba(146, 90, 53, ${alpha})`
        : type === "check" || type === "shield"
        ? `rgba(157, 91, 50, ${alpha})`
        : `rgba(123, 71, 41, ${alpha})`;
    ctx.lineWidth = 1.55;
    if (type === "capsule") {
      ctx.rotate(-0.72);
      ctx.beginPath();
      ctx.ellipse(-7, 0, 8, 5.5, 0, Math.PI * 0.5, Math.PI * 1.5);
      ctx.ellipse(7, 0, 8, 5.5, 0, Math.PI * 1.5, Math.PI * 0.5);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -5.5);
      ctx.lineTo(0, 5.5);
      ctx.stroke();
    } else if (type === "doc") {
      ctx.beginPath();
      ctx.moveTo(-8, -12);
      ctx.lineTo(6, -12);
      ctx.lineTo(10, -8);
      ctx.lineTo(10, 12);
      ctx.lineTo(-8, 12);
      ctx.closePath();
      ctx.moveTo(6, -12);
      ctx.lineTo(6, -8);
      ctx.lineTo(10, -8);
      ctx.moveTo(-4, -2);
      ctx.lineTo(5, -2);
      ctx.moveTo(-4, 5);
      ctx.lineTo(3, 5);
      ctx.stroke();
    } else if (type === "shield") {
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(11, -8);
      ctx.lineTo(8, 9);
      ctx.lineTo(0, 14);
      ctx.lineTo(-8, 9);
      ctx.lineTo(-11, -8);
      ctx.closePath();
      ctx.stroke();
    } else if (type === "warning") {
      ctx.beginPath();
      ctx.moveTo(0, -13);
      ctx.lineTo(13, 11);
      ctx.lineTo(-13, 11);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -3);
      ctx.lineTo(0, 4);
      ctx.moveTo(0, 8);
      ctx.lineTo(0.01, 8);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(-3, 7);
      ctx.lineTo(11, -8);
      ctx.stroke();
    }
    ctx.restore();
  }
}

class FeaturedStageController {
  constructor(options) {
    this.buttons = options.buttons;
    this.stage = options.stage;
    this.panel = options.panel;
    this.scrim = options.scrim;
    this.title = options.title;
    this.kicker = options.kicker;
    this.content = options.content;
    this.rail = options.rail;
    this.closeButton = options.closeButton;
    this.heroLinks = options.heroLinks;
    this.heroField = options.heroField;
    this.ribbon = options.ribbon;
    this.pageTrace = options.pageTrace;
    this.projectVisual = options.projectVisual;
    this.templates = new Map(
      Array.from(document.querySelectorAll("[data-project-template]")).map((template) => [
        template.dataset.projectTemplate,
        template,
      ])
    );
    this.meta = new Map();
    this.order = [];
    this.activeProject = null;
    this.lastTrigger = null;
    this.hideTimer = 0;
    this.settleTimer = 0;
    this.switchTimer = 0;

    this.handleKeydown = this.handleKeydown.bind(this);

    this.collectMeta();
    this.buildRail();
    this.bind();
    this.setCurrentHeroProject("neuropath");
    this.syncFromHash();
  }

  collectMeta() {
    this.buttons.forEach((button) => {
      const card = button.closest(".featured-card");
      const id = button.dataset.project;
      const title = button.querySelector(".project-card-title")?.textContent.trim() || id;
      const category = button.querySelector(".project-category")?.textContent.trim() || "Case study";
      const number = button.querySelector(".project-number")?.textContent.trim() || "";
      if (id && card) {
        this.meta.set(id, { id, mode: normalizeMode(id), card, button, title, category, number });
        this.order.push(id);
      }
    });
  }

  buildRail() {
    if (!this.rail) {
      return;
    }
    this.order.forEach((id) => {
      const meta = this.meta.get(id);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "stage-rail-button";
      const index = document.createElement("span");
      index.className = "stage-rail-index";
      index.textContent = meta.number;
      const name = document.createElement("span");
      name.className = "stage-rail-name";
      name.textContent = meta.title;
      button.append(index, name);
      button.addEventListener("click", () => this.switchTo(id));
      meta.railButton = button;
      this.rail.append(button);
    });
  }

  bind() {
    this.buttons.forEach((button) => {
      const id = button.dataset.project;
      const mode = normalizeMode(id);
      button.addEventListener("click", () => this.open(id, { trigger: button }));
      button.addEventListener("pointerenter", () => this.heroField?.setHoverMode(mode));
      button.addEventListener("pointerleave", () => this.heroField?.setHoverMode(null));
      button.addEventListener("focusin", () => this.heroField?.setHoverMode(mode));
      button.addEventListener("focusout", () => this.heroField?.setHoverMode(null));
    });

    this.heroLinks.forEach((link) => {
      const id = link.dataset.projectLink;
      const mode = normalizeMode(id);
      link.addEventListener("click", (event) => {
        event.preventDefault();
        this.open(id, { trigger: link });
      });
      link.addEventListener("pointerenter", () => this.heroField?.setHoverMode(mode));
      link.addEventListener("pointerleave", () => this.heroField?.setHoverMode(null));
      link.addEventListener("focusin", () => this.heroField?.setHoverMode(mode));
      link.addEventListener("focusout", () => this.heroField?.setHoverMode(null));
    });

    this.closeButton?.addEventListener("click", () => this.close({ clearHash: true }));
    this.scrim?.addEventListener("click", () => this.close({ clearHash: true }));
    window.addEventListener("hashchange", () => this.syncFromHash());
  }

  isOpen() {
    return Boolean(this.stage) && !this.stage.hidden;
  }

  lockScroll() {
    const compensation = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.paddingRight = compensation > 0 ? `${compensation}px` : "";
    document.body.classList.add("stage-lock");
  }

  unlockScroll() {
    document.body.classList.remove("stage-lock");
    document.body.style.paddingRight = "";
  }

  handleKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      this.close({ clearHash: true });
      return;
    }
    if (event.key !== "Tab" || !this.panel) {
      return;
    }
    const focusables = Array.from(
      this.panel.querySelectorAll('a[href], button:not([disabled]), [tabindex="0"]')
    );
    if (!focusables.length) {
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const current = document.activeElement;
    if (event.shiftKey && (current === first || !this.panel.contains(current))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && current === last) {
      event.preventDefault();
      first.focus();
    }
  }

  setCurrentHeroProject(projectId) {
    let matched = false;
    this.heroLinks.forEach((link) => {
      const active = link.dataset.projectLink === projectId;
      matched ||= active;
      link.classList.toggle("is-current", active);
    });
    if (!matched && this.heroLinks[0]) {
      this.heroLinks[0].classList.add("is-current");
    }
  }

  render(projectId) {
    const template = this.templates.get(projectId);
    const meta = this.meta.get(projectId);
    if (!template || !meta || !this.content || !this.title || !this.kicker) {
      return false;
    }
    this.content.replaceChildren(template.content.cloneNode(true));
    this.content.scrollTop = 0;
    this.title.textContent = meta.title;
    this.kicker.textContent = meta.category;
    this.meta.forEach((item) => {
      item.railButton?.classList.toggle("is-active", item.id === projectId);
      if (item.railButton) {
        if (item.id === projectId) {
          item.railButton.setAttribute("aria-current", "true");
        } else {
          item.railButton.removeAttribute("aria-current");
        }
      }
    });
    this.projectVisual?.setMode(meta.mode);
    return true;
  }

  visibleRowRect(meta) {
    if (!meta) {
      return null;
    }
    const rect = meta.card.getBoundingClientRect();
    if (rect.bottom < 60 || rect.top > window.innerHeight - 40) {
      return null;
    }
    return rect;
  }

  open(projectId, options = {}) {
    const meta = this.meta.get(projectId);
    if (!meta || !this.stage || !this.panel) {
      return;
    }
    if (this.isOpen()) {
      this.switchTo(projectId);
      return;
    }
    if (this.hideTimer) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = 0;
    }
    if (!this.render(projectId)) {
      return;
    }
    this.activeProject = projectId;
    this.lastTrigger = options.trigger || meta.button;
    this.setCurrentHeroProject(projectId);
    this.heroField?.setLockedMode(meta.mode);

    const reduced = reducedMotionQuery.matches;
    const fromRect = reduced ? null : this.visibleRowRect(meta);
    this.lockScroll();
    this.stage.hidden = false;
    this.heroField?.setSuspended(true);
    this.ribbon?.setSuspended(true);
    this.pageTrace?.setSuspended(true);

    // FLIP morph: the clicked row's rectangle inflates into the stage panel
    if (!reduced) {
      const panelRect = this.panel.getBoundingClientRect();
      this.panel.style.transition = "none";
      this.panel.style.transformOrigin = "top left";
      if (fromRect && panelRect.width > 0 && panelRect.height > 0) {
        const dx = fromRect.left - panelRect.left;
        const dy = fromRect.top - panelRect.top;
        const sx = Math.max(0.08, fromRect.width / panelRect.width);
        const sy = Math.max(0.08, fromRect.height / panelRect.height);
        this.panel.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
      } else {
        this.panel.style.transform = "translateY(16px) scale(0.97)";
      }
      void this.panel.offsetWidth;
      this.panel.style.transition = "";
    }

    window.requestAnimationFrame(() => {
      this.stage.classList.add("is-open");
      this.panel.style.transform = "";
      this.projectVisual?.resize();
      this.projectVisual?.syncLoop();
      document.addEventListener("keydown", this.handleKeydown);
      this.settleTimer = window.setTimeout(() => {
        this.title?.focus({ preventScroll: true });
      }, reduced ? 0 : 480);
    });

    if (options.updateHash !== false) {
      window.history.replaceState(null, "", `#${projectId}`);
    }
  }

  switchTo(projectId) {
    if (!this.isOpen() || !this.meta.has(projectId)) {
      return;
    }
    if (projectId === this.activeProject) {
      return;
    }
    const meta = this.meta.get(projectId);
    this.activeProject = projectId;
    this.setCurrentHeroProject(projectId);
    this.heroField?.setLockedMode(meta.mode);
    window.history.replaceState(null, "", `#${projectId}`);
    if (reducedMotionQuery.matches) {
      this.render(projectId);
      return;
    }
    if (this.switchTimer) {
      window.clearTimeout(this.switchTimer);
    }
    this.stage.classList.add("is-switching");
    this.switchTimer = window.setTimeout(() => {
      this.switchTimer = 0;
      this.render(projectId);
      this.stage.classList.remove("is-switching");
    }, 180);
  }

  close(options = {}) {
    if (!this.isOpen()) {
      return;
    }
    const closingProject = this.activeProject;
    const meta = this.meta.get(closingProject);
    this.activeProject = null;
    document.removeEventListener("keydown", this.handleKeydown);
    if (this.settleTimer) {
      window.clearTimeout(this.settleTimer);
      this.settleTimer = 0;
    }
    if (options.clearHash && closingProject) {
      this.clearHash(closingProject);
    }

    const finish = () => {
      this.hideTimer = 0;
      this.stage.classList.remove("is-open", "is-closing", "is-switching");
      this.stage.hidden = true;
      this.panel.style.transform = "";
      this.content?.replaceChildren();
      this.unlockScroll();
      this.projectVisual?.close();
      this.heroField?.setLockedMode(null);
      this.heroField?.setSuspended(false);
      this.ribbon?.setSuspended(false);
      this.pageTrace?.setSuspended(false);
      this.setCurrentHeroProject("neuropath");
      const trigger = this.lastTrigger;
      this.lastTrigger = null;
      trigger?.focus({ preventScroll: true });
    };

    if (reducedMotionQuery.matches) {
      finish();
      return;
    }

    // reverse morph: the stage folds back into the row it came from
    this.stage.classList.add("is-closing");
    const rect = this.visibleRowRect(meta);
    if (rect) {
      const panelRect = this.panel.getBoundingClientRect();
      const dx = rect.left - panelRect.left;
      const dy = rect.top - panelRect.top;
      const sx = Math.max(0.08, rect.width / panelRect.width);
      const sy = Math.max(0.08, rect.height / panelRect.height);
      this.panel.style.transformOrigin = "top left";
      this.panel.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
    } else {
      this.panel.style.transform = "translateY(12px) scale(0.98)";
    }
    this.stage.classList.remove("is-open");
    this.hideTimer = window.setTimeout(finish, 430);
  }

  clearHash(projectId) {
    if (window.location.hash.replace(/^#/, "") !== projectId) {
      return;
    }
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }

  syncFromHash() {
    const hash = window.location.hash.replace(/^#/, "");
    if (this.meta.has(hash)) {
      if (this.isOpen()) {
        this.switchTo(hash);
      } else {
        this.open(hash, { updateHash: false });
      }
      return;
    }
    if (this.isOpen()) {
      this.close({ clearHash: false });
      return;
    }
    this.setCurrentHeroProject("neuropath");
    this.heroField?.setLockedMode(null);
  }
}

function setupReveal(motion) {
  const revealItems = Array.from(document.querySelectorAll(".reveal, [data-rule]"));
  if (motion.reduced || !("IntersectionObserver" in window)) {
    revealItems.forEach((item) => item.classList.add("is-visible"));
    return;
  }
  const groupCounters = new Map();
  revealItems.forEach((item) => {
    if (!item.classList.contains("reveal")) {
      return;
    }
    const group = item.closest("[data-reveal-group]");
    if (!group) {
      return;
    }
    const index = groupCounters.get(group) || 0;
    item.style.setProperty("--reveal-delay", `${Math.min(index * 70, 420)}ms`);
    groupCounters.set(group, index + 1);
  });
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
  );
  revealItems.forEach((item) => observer.observe(item));
}

function setupNavObserver() {
  const links = Array.from(document.querySelectorAll("[data-nav]"));
  const sections = links
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean)
    .sort((a, b) => a.offsetTop - b.offsetTop);
  if (!links.length || !sections.length) {
    return;
  }

  let frame = 0;
  const update = () => {
    frame = 0;
    const offset = 120;
    let current = null;
    sections.forEach((section) => {
      if (section.getBoundingClientRect().top <= offset) {
        current = section;
      }
    });
    links.forEach((link) => {
      link.classList.toggle(
        "is-active",
        Boolean(current) && link.getAttribute("href") === `#${current.id}`
      );
    });
  };

  const queue = () => {
    if (!frame) {
      frame = window.requestAnimationFrame(update);
    }
  };

  window.addEventListener("scroll", queue, { passive: true });
  window.addEventListener("resize", queue);
  window.addEventListener("hashchange", queue);
  update();
}

const motion = new ReducedMotionManager(reducedMotionQuery);

const cursor = new CursorController(
  document.getElementById("cur"),
  document.getElementById("cur-ring"),
  motion
);

const heroField = new HeroFieldController(document.querySelector("[data-hero-field]"), motion);
const projectVisual = new ProjectVisualController(
  document.querySelector("[data-project-visual]"),
  motion
);

const glyphRibbon = new GlyphRibbonController(document.querySelector("[data-ribbon]"), motion);
const pageTrace = new PageTraceController(document.querySelector("[data-page-trace]"), motion);
new SpotlightController(
  Array.from(document.querySelectorAll(".project-card-button, .archive-row"))
);

new FeaturedStageController({
  buttons: Array.from(document.querySelectorAll(".project-card-button[data-project]")),
  stage: document.getElementById("project-stage"),
  panel: document.querySelector(".stage-panel"),
  scrim: document.querySelector(".stage-scrim"),
  title: document.getElementById("project-stage-title"),
  kicker: document.getElementById("project-stage-kicker"),
  content: document.getElementById("project-stage-content"),
  rail: document.querySelector("[data-stage-rail]"),
  closeButton: document.querySelector(".stage-close"),
  heroLinks: Array.from(document.querySelectorAll("[data-project-link]")),
  heroField,
  ribbon: glyphRibbon,
  pageTrace,
  projectVisual,
});

setupReveal(motion);
setupNavObserver();

motion.onChange(() => {
  cursor.sync();
  heroField.syncLoop();
  projectVisual.syncLoop();
});
