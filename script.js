const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const finePointerQuery = window.matchMedia("(hover: hover) and (pointer: fine)");

const modeAlias = {
  neuropath: "neuropath",
  "kerr-jp": "kerr",
  kerr: "kerr",
  motorproof: "motorproof",
  supplement: "supplement",
};

const visualNotes = {
  neuropath: "Particles gather into evidence-backed connectome paths around the cursor.",
  kerr: "A physically inspired browser visual, not a live GR ray tracer.",
  motorproof:
    "Requests slow at the backend boundary, split into provider lanes, then rejoin as a buyer brief.",
  supplement:
    "Guidance symbols align into safety lanes; optional products stay visually separate.",
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

class RibbonController {
  constructor(root, motion) {
    this.root = root;
    this.motion = motion;
    if (!this.root) {
      return;
    }
    this.root.addEventListener("pointerenter", () => {
      if (!this.motion.reduced) {
        this.root.classList.add("is-warm");
      }
    });
    this.root.addEventListener("pointerleave", () => this.root.classList.remove("is-warm"));
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
    this.root.addEventListener("pointerenter", (event) => {
      if (event.pointerType !== "touch" && !this.motion.reduced) {
        this.pointer.active = true;
      }
    });
    this.root.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch" || this.motion.reduced) {
        return;
      }
      const rect = this.root.getBoundingClientRect();
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
    });
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
      const centerX = this.width * (0.56 + (rand() - 0.5) * 0.2);
      const centerY = this.height * 0.5;
      return {
        x: centerX + Math.cos(angle) * radius * this.width * 0.42,
        y: centerY + Math.sin(angle) * radius * this.height * 0.42,
        baseX: this.width * (0.16 + rand() * 0.82),
        baseY: this.height * (0.08 + rand() * 0.84),
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

  shouldAnimate() {
    return !this.motion.reduced && this.inView && !document.hidden && Boolean(this.scene);
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
      return `rgba(159, 191, 194, ${alpha})`;
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
      ctx.strokeStyle = index % 3 === 0 ? "rgba(159, 191, 194, 0.38)" : "rgba(124, 71, 40, 0.34)";
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

      const alpha = 0.18 + particle.size * 0.045 + influence * 0.42 + modeFactor * 0.08;
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
  constructor(canvas, noteElement, motion) {
    this.canvas = canvas;
    this.noteElement = noteElement;
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
    this.pointer = { x: 0, y: 0, active: false, strength: 0 };

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
    this.canvas.addEventListener("pointerenter", (event) => {
      if (event.pointerType !== "touch" && !this.motion.reduced) {
        this.pointer.active = true;
      }
    });
    this.canvas.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch" || this.motion.reduced) {
        return;
      }
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.x = event.clientX - rect.left;
      this.pointer.y = event.clientY - rect.top;
      this.pointer.active = true;
    });
    this.canvas.addEventListener("pointerleave", () => {
      this.pointer.active = false;
    });
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
      { threshold: 0.12 }
    );
    observer.observe(this.panel);
  }

  setMode(mode, note = "") {
    this.mode = normalizeMode(mode);
    if (this.noteElement) {
      this.noteElement.textContent = note || visualNotes[this.mode] || "";
    }
    this.active = true;
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
    this.dpr = clamp(window.devicePixelRatio || 1, 1, 1.85);
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
    if (this.mode === "motorproof") {
      return {
        packets: Array.from({ length: 22 }, (_, index) => ({
          progress: rand(),
          lane: index % 4,
          speed: 0.045 + rand() * 0.035,
          phase: rand() * Math.PI * 2,
          kind: rand() > 0.72 ? "car" : "packet",
        })),
      };
    }
    if (this.mode === "supplement") {
      return {
        items: Array.from({ length: 24 }, (_, index) => ({
          x: rand(),
          y: rand(),
          lane: index % 3,
          progress: rand(),
          phase: rand() * Math.PI * 2,
          type: ["capsule", "doc", "shield", "warning", "lab", "product"][index % 6],
          speed: 0.03 + rand() * 0.025,
        })),
      };
    }
    if (this.mode === "kerr") {
      return {
        rays: Array.from({ length: 13 }, (_, index) => ({
          y: (index + 1) / 14,
          phase: rand() * Math.PI * 2,
          tone: index % 3,
        })),
        cells: Array.from({ length: 26 }, (_, index) => ({
          x: 0.6 + rand() * 0.28,
          y: 0.38 + rand() * 0.34,
          size: 0.035 / (1 + (index % 3)),
          phase: rand() * Math.PI * 2,
        })),
      };
    }
    return {
      nodes: Array.from({ length: 34 }, (_, index) => ({
        x: 0.15 + rand() * 0.74,
        y: 0.14 + rand() * 0.68,
        size: 2.4 + rand() * 4.4,
        phase: rand() * Math.PI * 2,
        validated: index % 4 !== 0,
      })),
      dust: Array.from({ length: 130 }, () => ({
        x: rand(),
        y: rand(),
        phase: rand() * Math.PI * 2,
        size: 0.7 + rand() * 1.5,
      })),
    };
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
      this.width * 0.68,
      this.height * 0.24,
      0,
      this.width * 0.68,
      this.height * 0.24,
      Math.max(this.width, this.height) * 0.75
    );
    radial.addColorStop(0, "rgba(216, 170, 104, 0.17)");
    radial.addColorStop(0.48, "rgba(216, 170, 104, 0.05)");
    radial.addColorStop(1, "rgba(216, 170, 104, 0)");
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  draw(timeStamp = 0) {
    if (!this.ctx || !this.scene) {
      return;
    }
    const time = timeStamp * 0.001;
    this.pointer.strength += ((this.pointer.active ? 1 : 0) - this.pointer.strength) * 0.09;
    const ctx = this.ctx;
    this.clearSurface(ctx);

    if (this.mode === "kerr") {
      this.drawKerr(ctx, time);
    } else if (this.mode === "motorproof") {
      this.drawMotorProof(ctx, time);
    } else if (this.mode === "supplement") {
      this.drawSupplement(ctx, time);
    } else {
      this.drawNeuroPath(ctx, time);
    }

    if (this.frame) {
      this.frame = window.requestAnimationFrame(this.draw);
    }
  }

  drawNeuroPath(ctx, time) {
    const { width, height } = this;
    const pointerX = this.pointer.active ? this.pointer.x : width * 0.58 + Math.sin(time * 0.3) * 24;
    const pointerY = this.pointer.active ? this.pointer.y : height * 0.48 + Math.cos(time * 0.25) * 18;
    const strength = Math.max(this.pointer.strength, this.pointer.active ? 0.2 : 0);
    const gatherNodes = Array.from({ length: 9 }, (_, index) => {
      const angle = (index / 9) * Math.PI * 2 + time * 0.45;
      const radius = 34 + (index % 4) * 17;
      return {
        x: pointerX + Math.cos(angle) * radius,
        y: pointerY + Math.sin(angle) * radius * 0.82,
      };
    });

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    this.scene.dust.forEach((dust) => {
      const x = dust.x * width + Math.sin(time * 0.4 + dust.phase) * 8;
      const y = dust.y * height + Math.cos(time * 0.34 + dust.phase) * 7;
      const influence = strength * ease(1 - Math.hypot(pointerX - x, pointerY - y) / 170);
      const node = gatherNodes[Math.floor(dust.phase * 10) % gatherNodes.length];
      const drawX = lerp(x, node.x, influence * 0.84);
      const drawY = lerp(y, node.y, influence * 0.84);
      ctx.fillStyle = `rgba(124, 71, 40, ${0.12 + influence * 0.38})`;
      ctx.beginPath();
      ctx.arc(drawX, drawY, dust.size + influence * 1.4, 0, Math.PI * 2);
      ctx.fill();
    });

    const nodes = this.scene.nodes.map((node, index) => {
      const idleX = node.x * width + Math.sin(time * 0.42 + node.phase) * 10;
      const idleY = node.y * height + Math.cos(time * 0.38 + node.phase) * 9;
      const influence = strength * ease(1 - Math.hypot(pointerX - idleX, pointerY - idleY) / 220);
      const gather = gatherNodes[index % gatherNodes.length];
      return {
        x: lerp(idleX, gather.x, influence * 0.8),
        y: lerp(idleY, gather.y, influence * 0.8),
        size: node.size + influence * 2,
        validated: node.validated,
        influence,
      };
    });

    nodes.forEach((a, index) => {
      for (let nextIndex = index + 1; nextIndex < nodes.length; nextIndex += 1) {
        const b = nodes[nextIndex];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        const threshold = 84 + (a.influence + b.influence) * 74;
        if (distance > threshold) {
          continue;
        }
        const alpha = (1 - distance / threshold) * (0.11 + (a.influence + b.influence) * 0.18);
        ctx.strokeStyle = a.validated && b.validated
          ? `rgba(163, 95, 52, ${alpha})`
          : `rgba(159, 191, 194, ${alpha * 0.78})`;
        ctx.lineWidth = 1 + (a.influence + b.influence) * 0.7;
        ctx.setLineDash(a.validated && b.validated ? [] : [4, 9]);
        ctx.lineDashOffset = -time * 16;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    });
    ctx.setLineDash([]);

    nodes.forEach((node) => {
      const pulse = (Math.sin(time * 2.4 + node.x * 0.02) + 1) * 0.5;
      ctx.fillStyle = node.validated
        ? `rgba(163, 95, 52, ${0.35 + node.influence * 0.34})`
        : `rgba(159, 191, 194, ${0.24 + node.influence * 0.28})`;
      ctx.strokeStyle = `rgba(255, 250, 242, ${0.25 + pulse * 0.2})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    if (strength > 0.05) {
      gatherNodes.forEach((node, index) => {
        const next = gatherNodes[(index + 3) % gatherNodes.length];
        const progress = (time * 0.55 + index / gatherNodes.length) % 1;
        const x = lerp(node.x, next.x, progress);
        const y = lerp(node.y, next.y, progress);
        ctx.fillStyle = `rgba(216, 170, 104, ${0.22 * strength})`;
        ctx.beginPath();
        ctx.arc(x, y, 3.2, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.restore();
  }

  drawKerr(ctx, time) {
    const { width, height } = this;
    const lensX = this.pointer.active ? this.pointer.x : width * 0.6;
    const lensY = this.pointer.active ? this.pointer.y : height * 0.5;
    const strength = 12500 + this.pointer.strength * 22000;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.strokeStyle = "rgba(124, 71, 40, 0.13)";
    ctx.lineWidth = 1;
    for (let y = 0.16; y <= 0.84; y += 0.12) {
      ctx.beginPath();
      for (let step = 0; step <= 40; step += 1) {
        const x = (step / 40) * width;
        const baseY = y * height;
        const dx = x - lensX;
        const dy = baseY - lensY;
        const bend = (-dy * strength) / (dx * dx + dy * dy + 12000);
        const drawY = baseY + bend * 0.42;
        if (step === 0) {
          ctx.moveTo(x, drawY);
        } else {
          ctx.lineTo(x, drawY);
        }
      }
      ctx.stroke();
    }
    for (let x = 0.14; x <= 0.86; x += 0.12) {
      ctx.beginPath();
      ctx.moveTo(x * width, height * 0.12);
      ctx.lineTo(x * width + Math.sin(time + x * 20) * 5, height * 0.88);
      ctx.stroke();
    }

    const shadow = ctx.createRadialGradient(lensX, lensY, 4, lensX, lensY, 96);
    shadow.addColorStop(0, "rgba(33, 20, 13, 0.36)");
    shadow.addColorStop(0.38, "rgba(124, 71, 40, 0.14)");
    shadow.addColorStop(1, "rgba(124, 71, 40, 0)");
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.arc(lensX, lensY, 96, 0, Math.PI * 2);
    ctx.fill();

    this.scene.rays.forEach((ray, index) => {
      ctx.strokeStyle = index % 3 === 0
        ? "rgba(216, 170, 104, 0.72)"
        : index % 3 === 1
        ? "rgba(163, 95, 52, 0.62)"
        : "rgba(159, 191, 194, 0.42)";
      ctx.lineWidth = index % 3 === 0 ? 1.8 : 1.2;
      ctx.beginPath();
      for (let step = 0; step <= 58; step += 1) {
        const x = (step / 58) * width;
        const baseY = ray.y * height + Math.sin(time * 0.8 + ray.phase + step * 0.18) * 1.8;
        const dx = x - lensX;
        const dy = baseY - lensY;
        const bend = (-dy * strength) / (dx * dx + dy * dy + 6200);
        const drawY = baseY + bend;
        if (step === 0) {
          ctx.moveTo(x, drawY);
        } else {
          ctx.lineTo(x, drawY);
        }
      }
      ctx.stroke();
    });

    ctx.strokeStyle = "rgba(124, 71, 40, 0.46)";
    ctx.lineWidth = 1.1;
    this.scene.cells.forEach((cell) => {
      const focus = 1 - clamp(Math.hypot(lensX - cell.x * width, lensY - cell.y * height) / 260, 0, 1);
      const size = cell.size * width * (1 + focus * 0.7);
      const x = cell.x * width + Math.sin(time + cell.phase) * 3;
      const y = cell.y * height + Math.cos(time * 0.8 + cell.phase) * 3;
      ctx.globalAlpha = 0.18 + focus * 0.46;
      ctx.strokeRect(x, y, size, size);
      if (focus > 0.45) {
        ctx.strokeRect(x + size / 2, y, size / 2, size / 2);
        ctx.strokeRect(x, y + size / 2, size / 2, size / 2);
      }
    });
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  drawMotorProof(ctx, time) {
    const { width, height } = this;
    const gateX = width * 0.48;
    const outputX = width * 0.84;
    const laneY = [0.26, 0.39, 0.54, 0.69].map((ratio) => ratio * height);
    const gateDistance = Math.hypot(this.pointer.x - gateX, this.pointer.y - height * 0.48);
    const gateInfluence = this.pointer.active ? ease(1 - gateDistance / 180) : 0;
    const speedScale = 1 - gateInfluence * 0.72;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(45, 27, 18, 0.32)";
    ctx.lineWidth = 1.4;

    laneY.forEach((y, index) => {
      ctx.beginPath();
      ctx.moveTo(width * 0.06, y);
      ctx.bezierCurveTo(width * 0.24, y, gateX - 36, height * 0.48, gateX, height * 0.48);
      ctx.bezierCurveTo(gateX + 46, height * (0.31 + index * 0.1), width * 0.68, y, outputX, y);
      ctx.stroke();
    });

    ctx.strokeStyle = `rgba(163, 95, 52, ${0.4 + gateInfluence * 0.38})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(gateX - 22, height * 0.25, 44, height * 0.5);
    ctx.beginPath();
    ctx.moveTo(gateX - 12, height * 0.42);
    ctx.lineTo(gateX + 12, height * 0.42);
    ctx.moveTo(gateX - 12, height * 0.54);
    ctx.lineTo(gateX + 12, height * 0.54);
    ctx.stroke();

    ctx.strokeStyle = "rgba(33, 20, 13, 0.55)";
    ctx.strokeRect(outputX - 25, height * 0.34, 50, height * 0.32);
    ctx.beginPath();
    ctx.moveTo(outputX - 14, height * 0.45);
    ctx.lineTo(outputX + 15, height * 0.45);
    ctx.moveTo(outputX - 14, height * 0.53);
    ctx.lineTo(outputX + 8, height * 0.53);
    ctx.stroke();

    this.scene.packets.forEach((packet) => {
      packet.progress = (packet.progress + packet.speed * 0.016 * speedScale) % 1;
      let p = packet.progress;
      const lane = packet.lane;
      const startY = laneY[lane];
      const providerY = laneY[(lane + 1) % laneY.length];
      const queue = gateInfluence * ease(1 - Math.abs(p - 0.42) / 0.18);
      p = Math.min(p, 0.44 + (p - 0.44) * (1 - queue * 0.8));
      const x = lerp(width * 0.07, outputX + 20, p);
      const merge = ease(clamp((p - 0.24) / 0.24, 0, 1));
      const split = ease(clamp((p - 0.48) / 0.28, 0, 1));
      const y = lerp(lerp(startY, height * 0.48, merge), providerY, split);
      const response = ease(clamp((p - 0.68) / 0.25, 0, 1));
      const drawY = lerp(y, height * 0.5, response * 0.65);
      const alpha = 0.45 + Math.sin(time * 2 + packet.phase) * 0.08;

      ctx.strokeStyle = packet.kind === "car"
        ? `rgba(33, 20, 13, ${alpha})`
        : `rgba(216, 170, 104, ${alpha + 0.12})`;
      ctx.lineWidth = packet.kind === "car" ? 2 : 3;
      ctx.beginPath();
      if (packet.kind === "car") {
        ctx.moveTo(x - 9, drawY + 3);
        ctx.lineTo(x - 5, drawY - 3);
        ctx.lineTo(x + 7, drawY - 3);
        ctx.lineTo(x + 10, drawY + 3);
      } else {
        ctx.moveTo(x - 10, drawY);
        ctx.lineTo(x + 10, drawY);
      }
      ctx.stroke();
    });

    if (gateInfluence > 0.05) {
      const glow = ctx.createRadialGradient(gateX, height * 0.48, 0, gateX, height * 0.48, 130);
      glow.addColorStop(0, `rgba(216, 170, 104, ${0.28 * gateInfluence})`);
      glow.addColorStop(1, "rgba(216, 170, 104, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(gateX - 130, height * 0.48 - 130, 260, 260);
    }
    ctx.restore();
  }

  drawSupplement(ctx, time) {
    const { width, height } = this;
    const gateX = width * 0.5;
    const laneY = [height * 0.34, height * 0.5, height * 0.66];
    const gateInfluence = this.pointer.active
      ? ease(1 - Math.hypot(this.pointer.x - gateX, this.pointer.y - height * 0.5) / 230)
      : 0;
    const align = Math.max(gateInfluence, this.pointer.active ? 0.42 : 0);

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.strokeStyle = "rgba(45, 27, 18, 0.28)";
    ctx.lineWidth = 1.2;
    laneY.forEach((y, index) => {
      ctx.setLineDash(index === 1 ? [] : [6, 12]);
      ctx.beginPath();
      ctx.moveTo(width * 0.08, y);
      ctx.bezierCurveTo(width * 0.28, y, gateX - 46, height * 0.5, gateX, height * 0.5);
      ctx.bezierCurveTo(gateX + 42, height * 0.5, width * 0.7, y, width * 0.92, y);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    ctx.strokeStyle = `rgba(163, 95, 52, ${0.44 + align * 0.28})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(gateX - 24, height * 0.24, 48, height * 0.54);
    ctx.beginPath();
    ctx.moveTo(gateX - 9, height * 0.42);
    ctx.lineTo(gateX + 9, height * 0.42);
    ctx.moveTo(gateX - 9, height * 0.58);
    ctx.lineTo(gateX + 9, height * 0.58);
    ctx.stroke();

    ctx.strokeStyle = "rgba(124, 71, 40, 0.28)";
    ctx.beginPath();
    ctx.moveTo(width * 0.14, height * 0.82);
    ctx.lineTo(width * 0.86, height * 0.82);
    ctx.stroke();

    this.scene.items.forEach((item) => {
      item.progress = (item.progress + item.speed * 0.014) % 1;
      const lane = laneY[item.lane];
      const looseX = item.x * width + Math.sin(time * 0.5 + item.phase) * 22;
      const looseY = item.y * height + Math.cos(time * 0.42 + item.phase) * 18;
      const laneX = lerp(width * 0.08, width * 0.9, item.progress);
      const outputLane =
        item.type === "warning" ? laneY[2] : item.type === "doc" || item.type === "lab" ? laneY[1] : laneY[0];
      let y = lerp(lane, outputLane, ease(clamp((item.progress - 0.52) / 0.32, 0, 1)));
      let x = laneX;

      if (item.type === "warning" && item.progress > 0.48 && item.progress < 0.62) {
        x = Math.min(x, gateX - 35);
      }
      if (item.type === "product") {
        x = lerp(width * 0.22, width * 0.82, item.progress);
        y = height * 0.82 + Math.sin(time + item.phase) * 4;
      }

      const drawX = lerp(looseX, x, align);
      const drawY = lerp(looseY, y, align);
      this.drawSupplementSymbol(ctx, item.type, drawX, drawY, 0.55 + align * 0.38);
    });

    ctx.restore();
  }

  drawSupplementSymbol(ctx, type, x, y, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle =
      type === "warning"
        ? `rgba(124, 71, 40, ${alpha})`
        : type === "product"
        ? `rgba(154, 133, 112, ${alpha * 0.72})`
        : `rgba(163, 95, 52, ${alpha})`;
    ctx.fillStyle = `rgba(255, 250, 242, ${alpha * 0.14})`;
    ctx.lineWidth = 1.7;
    if (type === "capsule") {
      ctx.rotate(-0.72);
      ctx.beginPath();
      ctx.roundRect(-14, -6, 28, 12, 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(0, 6);
      ctx.stroke();
    } else if (type === "doc") {
      ctx.strokeRect(-10, -13, 20, 26);
      ctx.beginPath();
      ctx.moveTo(-5, -4);
      ctx.lineTo(6, -4);
      ctx.moveTo(-5, 4);
      ctx.lineTo(3, 4);
      ctx.stroke();
    } else if (type === "shield") {
      ctx.beginPath();
      ctx.moveTo(0, -15);
      ctx.lineTo(13, -9);
      ctx.lineTo(10, 10);
      ctx.lineTo(0, 15);
      ctx.lineTo(-10, 10);
      ctx.lineTo(-13, -9);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-5, 0);
      ctx.lineTo(-1, 5);
      ctx.lineTo(7, -5);
      ctx.stroke();
    } else if (type === "warning") {
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(14, 12);
      ctx.lineTo(-14, 12);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -4);
      ctx.lineTo(0, 4);
      ctx.moveTo(0, 9);
      ctx.lineTo(0.01, 9);
      ctx.stroke();
    } else if (type === "lab") {
      ctx.beginPath();
      ctx.moveTo(-6, -12);
      ctx.lineTo(6, -12);
      ctx.moveTo(-2, -12);
      ctx.lineTo(-2, 2);
      ctx.lineTo(-10, 14);
      ctx.lineTo(10, 14);
      ctx.lineTo(2, 2);
      ctx.lineTo(2, -12);
      ctx.stroke();
    } else {
      ctx.strokeRect(-12, -9, 24, 18);
      ctx.beginPath();
      ctx.moveTo(-7, -2);
      ctx.lineTo(7, -2);
      ctx.moveTo(-7, 4);
      ctx.lineTo(3, 4);
      ctx.stroke();
    }
    ctx.restore();
  }
}

class FeaturedDrawerController {
  constructor(options) {
    this.buttons = options.buttons;
    this.drawer = options.drawer;
    this.drawerTitle = options.drawerTitle;
    this.drawerKicker = options.drawerKicker;
    this.drawerStage = options.drawerStage;
    this.closeButton = options.closeButton;
    this.heroLinks = options.heroLinks;
    this.heroField = options.heroField;
    this.projectVisual = options.projectVisual;
    this.templates = new Map(
      Array.from(document.querySelectorAll("[data-project-template]")).map((template) => [
        template.dataset.projectTemplate,
        template,
      ])
    );
    this.meta = new Map();
    this.activeProject = null;
    this.closeTimer = 0;

    this.collectMeta();
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
      if (id && card) {
        this.meta.set(id, { id, mode: normalizeMode(id), card, button, title, category });
      }
    });
  }

  bind() {
    this.buttons.forEach((button) => {
      const id = button.dataset.project;
      const mode = normalizeMode(id);
      button.addEventListener("click", () => this.toggle(id));
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
        this.toggle(id, { scrollToCard: true });
      });
      link.addEventListener("pointerenter", () => this.heroField?.setHoverMode(mode));
      link.addEventListener("pointerleave", () => this.heroField?.setHoverMode(null));
      link.addEventListener("focusin", () => this.heroField?.setHoverMode(mode));
      link.addEventListener("focusout", () => this.heroField?.setHoverMode(null));
    });

    this.closeButton?.addEventListener("click", () => this.close({ clearHash: true }));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.activeProject) {
        this.close({ clearHash: true });
      }
    });
    window.addEventListener("hashchange", () => this.syncFromHash());
  }

  setCardState(projectId) {
    this.meta.forEach((item, id) => {
      const active = id === projectId;
      item.card.classList.toggle("is-active", active);
      item.button.setAttribute("aria-expanded", String(active));
    });
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
    if (!template || !meta || !this.drawerStage || !this.drawerTitle || !this.drawerKicker) {
      return false;
    }
    this.drawerStage.replaceChildren(template.content.cloneNode(true));
    this.drawerTitle.textContent = meta.title;
    this.drawerKicker.textContent = meta.category;
    this.projectVisual?.setMode(meta.mode, template.dataset.note);
    return true;
  }

  open(projectId, options = {}) {
    const meta = this.meta.get(projectId);
    if (!meta || !this.drawer) {
      return;
    }
    if (this.closeTimer) {
      window.clearTimeout(this.closeTimer);
      this.closeTimer = 0;
    }
    if (!this.render(projectId)) {
      return;
    }
    this.activeProject = projectId;
    this.setCardState(projectId);
    this.setCurrentHeroProject(projectId);
    this.heroField?.setLockedMode(meta.mode);
    this.drawer.hidden = false;
    window.requestAnimationFrame(() => {
      this.drawer.classList.add("is-open");
      this.projectVisual?.resize();
      this.projectVisual?.syncLoop();
    });
    if (options.updateHash !== false) {
      window.history.replaceState(null, "", `#${projectId}`);
    }
    if (options.scrollToCard) {
      meta.card.scrollIntoView({
        behavior: reducedMotionQuery.matches ? "auto" : "smooth",
        block: "start",
      });
    }
  }

  close(options = {}) {
    if (!this.drawer || this.drawer.hidden) {
      this.activeProject = null;
      this.setCardState(null);
      this.heroField?.setLockedMode(null);
      this.projectVisual?.close();
      return;
    }
    const closingProject = this.activeProject;
    this.activeProject = null;
    this.drawer.classList.remove("is-open");
    this.setCardState(null);
    this.heroField?.setLockedMode(null);
    this.setCurrentHeroProject("neuropath");
    this.projectVisual?.close();

    if (options.clearHash && closingProject) {
      this.clearHash(closingProject);
    }

    const finish = () => {
      this.drawer.hidden = true;
      this.drawerStage?.replaceChildren();
    };

    if (reducedMotionQuery.matches) {
      finish();
      return;
    }
    this.closeTimer = window.setTimeout(() => {
      this.closeTimer = 0;
      finish();
    }, 420);
  }

  toggle(projectId, options = {}) {
    if (this.activeProject === projectId) {
      this.close({ clearHash: true });
      return;
    }
    this.open(projectId, options);
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
      this.open(hash, { updateHash: false });
      return;
    }
    if (!this.activeProject) {
      this.setCurrentHeroProject("neuropath");
      this.heroField?.setLockedMode(null);
    }
  }
}

function setupReveal(motion) {
  const revealItems = Array.from(document.querySelectorAll(".reveal"));
  if (motion.reduced || !("IntersectionObserver" in window)) {
    revealItems.forEach((item) => item.classList.add("is-visible"));
    return;
  }
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

function setupPrimaryActionBurst(motion) {
  const primary = document.querySelector(".hero-action--primary");
  if (!primary) {
    return;
  }
  primary.addEventListener("click", (event) => {
    if (motion.reduced || !finePointerQuery.matches) {
      return;
    }
    const rect = primary.getBoundingClientRect();
    const burst = document.createElement("span");
    burst.className = "cta-burst";
    burst.style.setProperty("--burst-x", `${event.clientX - rect.left}px`);
    burst.style.setProperty("--burst-y", `${event.clientY - rect.top}px`);
    primary.append(burst);
    window.setTimeout(() => burst.remove(), 760);
  });
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
  document.querySelector("[data-project-note]"),
  motion
);

new RibbonController(document.querySelector(".symbol-ribbon"), motion);
new SpotlightController(
  Array.from(
    document.querySelectorAll(
      ".hero-action, .proof-item, .project-card-button, .mini-card, .drawer-surface"
    )
  )
);

new FeaturedDrawerController({
  buttons: Array.from(document.querySelectorAll(".project-card-button[data-project]")),
  drawer: document.getElementById("project-drawer"),
  drawerTitle: document.getElementById("project-drawer-title"),
  drawerKicker: document.getElementById("project-drawer-kicker"),
  drawerStage: document.getElementById("project-drawer-content"),
  closeButton: document.querySelector(".drawer-close"),
  heroLinks: Array.from(document.querySelectorAll("[data-project-link]")),
  heroField,
  projectVisual,
});

setupReveal(motion);
setupPrimaryActionBurst(motion);
setupNavObserver();

motion.onChange(() => {
  cursor.sync();
  heroField.syncLoop();
  projectVisual.syncLoop();
});
