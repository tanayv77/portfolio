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

class RibbonController {
  constructor(root, motion) {
    this.root = root;
    this.motion = motion;
    if (!this.root) {
      return;
    }
    this.prepareSymbols();
    this.root.addEventListener("pointerenter", () => {
      if (!this.motion.reduced) {
        this.root.classList.add("is-warm");
      }
    });
    this.root.addEventListener("pointerleave", () => this.root.classList.remove("is-warm"));
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        this.root.classList.add("is-ready");
      });
    });
  }

  prepareSymbols() {
    const symbols = Array.from(this.root.querySelectorAll(".ribbon-symbol"));
    symbols.forEach((symbol, index) => {
      const primary = symbol.querySelector("svg");
      if (!primary || primary.classList.contains("ribbon-primary")) {
        return;
      }
      primary.classList.add("ribbon-primary");
      const ghost = primary.cloneNode(true);
      const echo = primary.cloneNode(true);
      ghost.classList.remove("ribbon-primary");
      echo.classList.remove("ribbon-primary");
      ghost.classList.add("ribbon-ghost");
      echo.classList.add("ribbon-echo");
      ghost.setAttribute("aria-hidden", "true");
      echo.setAttribute("aria-hidden", "true");
      symbol.prepend(echo);
      symbol.prepend(ghost);
      const direction = index % 2 === 0 ? 1 : -1;
      symbol.style.setProperty("--ghost-x", `${direction * (11 + (index % 4) * 3)}px`);
      symbol.style.setProperty("--ghost-y", `${-10 + (index % 3) * 5}px`);
      symbol.style.setProperty("--phase", symbol.style.getPropertyValue("--phase") || `${index * 0.34}s`);
    });
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
      const rayCount = this.width < 520 ? 24 : 48;
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
      return { rays, rand };
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
      const types = ["capsule", "tablet", "bottle", "doc", "shield", "warning", "check", "lab", "product", "profile"];
      return {
        lastSpawn: 0,
        cursorBurst: 0,
        symbols: [],
        idle: Array.from({ length: this.width < 520 ? 14 : 22 }, (_, index) => ({
          x: 0.12 + rand() * 0.76,
          y: 0.18 + rand() * 0.62,
          phase: rand() * Math.PI * 2,
          type: types[index % types.length],
          size: 0.66 + rand() * 0.3,
          drift: 0.6 + rand() * 0.7,
        })),
      };
    }
    return this.buildNeuroPathScene(rand);
  }

  buildNeuroPathScene(rand) {
    const compact = this.width < 520;
    const layout = compact
      ? [
          [0.24, 0.54, -0.08, 0.95],
          [0.52, 0.43, 0.06, 1.03],
          [0.79, 0.55, -0.03, 0.94],
        ]
      : [
          [0.24, 0.54, -0.08, 1],
          [0.52, 0.42, 0.06, 1.08],
          [0.78, 0.55, -0.03, 0.98],
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
    if (!scene || !this.pointer.active || this.pointer.strength < 0.03) {
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
    radial.addColorStop(0, "rgba(210, 161, 95, 0.095)");
    radial.addColorStop(0.58, "rgba(210, 161, 95, 0.025)");
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
    this.pointer.strength += ((this.pointer.active ? 1 : 0) - this.pointer.strength) * 0.1;

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
      return `rgba(180, 204, 208, ${alpha})`;
    }
    if (tint === "gold") {
      return `rgba(210, 161, 95, ${alpha})`;
    }
    return `rgba(157, 91, 50, ${alpha})`;
  }

  spawnNeuron(time) {
    const scene = this.scene;
    if (!this.pointer.active || !scene) {
      return;
    }
    const distanceFromLast = scene.lastSpawnX === null
      ? Infinity
      : Math.hypot(this.pointer.x - scene.lastSpawnX, this.pointer.y - scene.lastSpawnY);
    const pointerSpeed = Math.hypot(this.pointer.vx, this.pointer.vy);
    const minTime = pointerSpeed > 1.4 ? 0.18 : 0.5;
    if (time - scene.lastSpawn < minTime || distanceFromLast < 42) {
      return;
    }
    scene.lastSpawn = time;
    scene.lastSpawnX = this.pointer.x;
    scene.lastSpawnY = this.pointer.y;
    scene.seed += 1;
    const rand = mulberry32(hashSeed(`neuron-${scene.seed}-${Math.round(this.pointer.x)}-${Math.round(this.pointer.y)}`));
    const travelAngle = pointerSpeed > 2
      ? Math.atan2(this.pointer.vy, this.pointer.vx)
      : -0.16 + (rand() - 0.5) * 0.7;
    const axonAngle = travelAngle + (rand() - 0.5) * 0.42;
    const somaX = clamp(this.pointer.x + (rand() - 0.5) * 20, 28, this.width - 28);
    const somaY = clamp(this.pointer.y + (rand() - 0.5) * 20, 30, this.height - 30);
    const branchCount = this.width < 520 ? 7 : 9 + Math.floor(rand() * 3);
    const dendrites = Array.from({ length: branchCount }, (_, index) => {
      const fan = branchCount > 1 ? (index / (branchCount - 1) - 0.5) : 0;
      const angle = axonAngle + Math.PI + fan * Math.PI * 1.55 + (rand() - 0.5) * 0.46;
      const length = 42 + rand() * 78;
      const bend = (rand() - 0.5) * 36 + Math.sin(index * 1.83) * 8;
      const forkCount = 2 + Math.floor(rand() * 2);
      return {
        angle,
        length,
        bend,
        width: 1.05 + rand() * 0.65,
        forks: Array.from({ length: forkCount }, (_, forkIndex) => ({
          at: 0.34 + rand() * 0.5,
          angle: angle + (forkIndex % 2 === 0 ? 1 : -1) * (0.44 + rand() * 0.68),
          length: 13 + rand() * 34,
          bend: (rand() - 0.5) * 20,
          spinePhase: rand() * Math.PI * 2,
        })),
        phase: rand() * Math.PI * 2,
        endpoint: { x: 0, y: 0 }
      };
    });
    const terminalCount = 3 + Math.floor(rand() * 3);
    const axon = {
      angle: axonAngle,
      length: Math.min(this.width * 0.36, 132 + rand() * 104),
      bend: (rand() - 0.5) * 58,
      terminals: Array.from({ length: terminalCount }, (_, index) => ({
        angle: axonAngle + (index - (terminalCount - 1) / 2) * 0.34 + (rand() - 0.5) * 0.2,
        length: 18 + rand() * 34,
        phase: rand() * Math.PI * 2,
      })),
    };
    scene.neurons.push({
      x: somaX,
      y: somaY,
      born: time,
      last: time,
      life: 4.8 + rand() * 0.9,
      size: 10.5 + rand() * 4.2,
      dendrites,
      axon,
      validated: rand() > 0.7,
      phase: rand() * Math.PI * 2,
    });
    const cap = this.width < 520 ? 5 : 6;
    if (scene.neurons.length > cap) {
      scene.neurons.shift();
    }
  }

  neuronPoint(neuron, branch, amount) {
    const growLength = branch.length * amount;
    const endX = neuron.x + Math.cos(branch.angle) * growLength;
    const endY = neuron.y + Math.sin(branch.angle) * growLength;
    const cX = neuron.x + Math.cos(branch.angle + Math.PI * 0.5) * branch.bend * amount + Math.cos(branch.angle) * growLength * 0.46;
    const cY = neuron.y + Math.sin(branch.angle + Math.PI * 0.5) * branch.bend * amount + Math.sin(branch.angle) * growLength * 0.46;
    const inv = 1 - amount;
    return {
      x: inv * inv * neuron.x + 2 * inv * amount * cX + amount * amount * endX,
      y: inv * inv * neuron.y + 2 * inv * amount * cY + amount * amount * endY,
      cX,
      cY,
      endX,
      endY,
    };
  }

  axonPoint(neuron, amount) {
    const axon = neuron.axon;
    const length = axon.length * amount;
    const endX = neuron.x + Math.cos(axon.angle) * length;
    const endY = neuron.y + Math.sin(axon.angle) * length;
    const cX = neuron.x + Math.cos(axon.angle + Math.PI * 0.5) * axon.bend * amount + Math.cos(axon.angle) * length * 0.5;
    const cY = neuron.y + Math.sin(axon.angle + Math.PI * 0.5) * axon.bend * amount + Math.sin(axon.angle) * length * 0.5;
    const inv = 1 - amount;
    return {
      x: inv * inv * neuron.x + 2 * inv * amount * cX + amount * amount * endX,
      y: inv * inv * neuron.y + 2 * inv * amount * cY + amount * amount * endY,
      cX,
      cY,
      endX,
      endY,
    };
  }

  findNearestDendrite(sourceNeuron, terminalX, terminalY, neurons) {
    let best = null;
    let bestDistance = 9999;
    for (let i = 0; i < neurons.length; i += 1) {
      const target = neurons[i];
      if (target === sourceNeuron) {
        continue;
      }
      const somaDistance = Math.hypot(target.x - terminalX, target.y - terminalY);
      if (somaDistance < bestDistance) {
        bestDistance = somaDistance;
        best = { x: target.x, y: target.y, soma: true };
      }
      for (let j = 0; j < target.dendrites.length; j += 1) {
        const branch = target.dendrites[j];
        const endpoint = branch.endpoint;
        if (!endpoint.ready) {
          continue;
        }
        const distance = Math.hypot(endpoint.x - terminalX, endpoint.y - terminalY);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = endpoint;
        }
      }
    }
    return bestDistance < 86 ? { point: best, distance: bestDistance } : null;
  }

  drawNeuroPath(ctx, time) {
    const { width, height } = this;
    this.spawnNeuron(time);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const pointerActive = this.pointer.active && this.pointer.strength > 0.025;
    for (let i = 0; i < this.scene.dust.length; i += 1) {
      const dust = this.scene.dust[i];
      const x = dust.x * width + Math.sin(time * 0.26 + dust.phase) * 9;
      const y = dust.y * height + Math.cos(time * 0.22 + dust.phase) * 7;
      const influence = pointerActive
        ? ease(1 - Math.hypot(this.pointer.x - x, this.pointer.y - y) / 155) * this.pointer.strength
        : 0;
      ctx.fillStyle = this.tint(dust.tint, 0.075 + influence * 0.24);
      ctx.beginPath();
      ctx.arc(lerp(x, this.pointer.x, influence * 0.16), lerp(y, this.pointer.y, influence * 0.16), dust.size + influence * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    const neurons = this.scene.neurons;
    for (let i = neurons.length - 1; i >= 0; i -= 1) {
      const neuron = neurons[i];
      if (pointerActive && Math.hypot(this.pointer.x - neuron.x, this.pointer.y - neuron.y) < 104) {
        neuron.last = time;
      }
      if (time - neuron.last >= neuron.life) {
        neurons.splice(i, 1);
      }
    }

    for (let i = 0; i < neurons.length; i += 1) {
      const neuron = neurons[i];
      const decay = clamp((time - neuron.last) / neuron.life, 0, 1);
      const alpha = ease(1 - decay);
      const edgeAlpha = ease(1 - decay * 1.18);
      const age = time - neuron.born;
      for (let index = 0; index < neuron.dendrites.length; index += 1) {
        const branch = neuron.dendrites[index];
        const grow = ease(clamp(age * 0.92 - index * 0.035, 0, 1));
        if (grow <= 0) {
          branch.endpoint.ready = false;
          continue;
        }
        const p = this.neuronPoint(neuron, branch, grow);
        branch.endpoint.x = p.x;
        branch.endpoint.y = p.y;
        branch.endpoint.ready = grow > 0.7;
        ctx.strokeStyle = neuron.validated
          ? `rgba(180, 204, 208, ${0.16 * edgeAlpha})`
          : `rgba(123, 71, 41, ${0.24 * edgeAlpha})`;
        ctx.lineWidth = branch.width + edgeAlpha * 0.72;
        ctx.beginPath();
        ctx.moveTo(neuron.x, neuron.y);
        ctx.quadraticCurveTo(p.cX, p.cY, p.x, p.y);
        ctx.stroke();

        for (let forkIndex = 0; forkIndex < branch.forks.length; forkIndex += 1) {
          const fork = branch.forks[forkIndex];
          if (grow < fork.at) {
            continue;
          }
          const forkGrow = ease((grow - fork.at) / (1 - fork.at));
          const origin = this.neuronPoint(neuron, branch, fork.at);
          const fx = origin.x + Math.cos(fork.angle) * fork.length * forkGrow;
          const fy = origin.y + Math.sin(fork.angle) * fork.length * forkGrow;
          ctx.strokeStyle = `rgba(123, 71, 41, ${0.15 * edgeAlpha})`;
          ctx.lineWidth = 0.64 + edgeAlpha * 0.36;
          ctx.beginPath();
          ctx.moveTo(origin.x, origin.y);
          ctx.quadraticCurveTo(
            origin.x + Math.cos(fork.angle + 0.58) * fork.bend,
            origin.y + Math.sin(fork.angle + 0.58) * fork.bend,
            fx,
            fy
          );
          ctx.stroke();

          const spineT = 0.4 + ((fork.spinePhase + time * 0.02) % 0.35);
          if (forkGrow > spineT) {
            const spineX = origin.x + Math.cos(fork.angle) * fork.length * spineT;
            const spineY = origin.y + Math.sin(fork.angle) * fork.length * spineT;
            ctx.strokeStyle = `rgba(123, 71, 41, ${0.08 * edgeAlpha})`;
            ctx.lineWidth = 0.55;
            ctx.beginPath();
            ctx.moveTo(spineX, spineY);
            ctx.lineTo(
              spineX + Math.cos(fork.angle + Math.PI * 0.55) * 4.2,
              spineY + Math.sin(fork.angle + Math.PI * 0.55) * 4.2
            );
            ctx.stroke();
          }

          ctx.fillStyle = `rgba(210, 161, 95, ${0.18 * alpha})`;
          ctx.beginPath();
          ctx.arc(fx, fy, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }

        if (index % 2 === 0 && grow > 0.66) {
          const spine = this.neuronPoint(neuron, branch, 0.72 + (branch.phase % 0.2));
          ctx.fillStyle = `rgba(123, 71, 41, ${0.11 * edgeAlpha})`;
          ctx.beginPath();
          ctx.arc(spine.x + Math.cos(branch.angle + 1.2) * 4, spine.y + Math.sin(branch.angle + 1.2) * 4, 1.15, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    for (let i = 0; i < neurons.length; i += 1) {
      const neuron = neurons[i];
      const decay = clamp((time - neuron.last) / neuron.life, 0, 1);
      const alpha = ease(1 - decay);
      const edgeAlpha = ease(1 - decay * 1.18);
      const age = time - neuron.born;
      const grow = ease(clamp(age * 0.62, 0, 1));
      const axonEnd = this.axonPoint(neuron, grow);
      neuron.axon.end = axonEnd;
      ctx.strokeStyle = neuron.validated
        ? `rgba(180, 204, 208, ${0.2 * edgeAlpha})`
        : `rgba(157, 91, 50, ${0.3 * edgeAlpha})`;
      ctx.lineWidth = 1.05 + edgeAlpha * 0.48;
      ctx.beginPath();
      ctx.moveTo(neuron.x, neuron.y);
      ctx.quadraticCurveTo(axonEnd.cX, axonEnd.cY, axonEnd.x, axonEnd.y);
      ctx.stroke();

      for (let terminalIndex = 0; terminalIndex < neuron.axon.terminals.length; terminalIndex += 1) {
        const terminal = neuron.axon.terminals[terminalIndex];
        if (grow < 0.74) {
          terminal.ready = false;
          continue;
        }
        const terminalGrow = ease((grow - 0.74) / 0.26);
        const base = this.axonPoint(neuron, 0.9 + (terminal.phase % 0.08));
        const tx = base.x + Math.cos(terminal.angle) * terminal.length * terminalGrow;
        const ty = base.y + Math.sin(terminal.angle) * terminal.length * terminalGrow;
        terminal.x = tx;
        terminal.y = ty;
        terminal.ready = terminalGrow > 0.72;
        ctx.strokeStyle = `rgba(123, 71, 41, ${0.18 * edgeAlpha})`;
        ctx.lineWidth = 0.92;
        ctx.beginPath();
        ctx.moveTo(base.x, base.y);
        ctx.quadraticCurveTo(
          base.x + Math.cos(terminal.angle + 0.45) * 14,
          base.y + Math.sin(terminal.angle + 0.45) * 14,
          tx,
          ty
        );
        ctx.stroke();
        ctx.fillStyle = `rgba(157, 91, 50, ${0.24 * alpha})`;
        ctx.beginPath();
        ctx.arc(tx, ty, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }

      if (age > 0.75 && edgeAlpha > 0.12) {
        const pulseT = (time * 0.5 + neuron.phase) % 1;
        const pulse = this.axonPoint(neuron, pulseT);
        ctx.fillStyle = neuron.validated
          ? `rgba(180, 204, 208, ${0.54 * edgeAlpha})`
          : `rgba(255, 231, 187, ${0.48 * edgeAlpha})`;
        ctx.beginPath();
        ctx.arc(pulse.x, pulse.y, 2.4, 0, Math.PI * 2);
        ctx.fill();

        const branch = neuron.dendrites[(Math.floor(time + neuron.phase) + i) % neuron.dendrites.length];
        const dendritePulseT = (time * 0.34 + neuron.phase * 0.37) % 1;
        if (branch?.endpoint.ready && dendritePulseT < 0.92) {
          const dendritePulse = this.neuronPoint(neuron, branch, dendritePulseT);
          ctx.fillStyle = `rgba(180, 204, 208, ${0.28 * edgeAlpha})`;
          ctx.beginPath();
          ctx.arc(dendritePulse.x, dendritePulse.y, 1.65, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    for (let i = 0; i < neurons.length; i += 1) {
      const neuron = neurons[i];
      const decay = clamp((time - neuron.last) / neuron.life, 0, 1);
      const alpha = ease(1 - decay);
      let bestContact = null;
      for (let j = 0; j < neuron.axon.terminals.length; j += 1) {
        const terminal = neuron.axon.terminals[j];
        if (!terminal.ready) {
          continue;
        }
        const target = this.findNearestDendrite(neuron, terminal.x, terminal.y, neurons);
        if (target && (!bestContact || target.distance < bestContact.distance)) {
          bestContact = { terminal, point: target.point, distance: target.distance };
        }
      }
      if (bestContact) {
        const contactAlpha = (1 - bestContact.distance / 86) * 0.23 * alpha;
        ctx.strokeStyle = `rgba(123, 71, 41, ${contactAlpha})`;
        ctx.lineWidth = 0.9;
        ctx.setLineDash([3, 7]);
        ctx.beginPath();
        ctx.moveTo(bestContact.terminal.x, bestContact.terminal.y);
        ctx.quadraticCurveTo(
          (bestContact.terminal.x + bestContact.point.x) / 2,
          (bestContact.terminal.y + bestContact.point.y) / 2 - 16,
          bestContact.point.x,
          bestContact.point.y
        );
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = `rgba(180, 204, 208, ${contactAlpha * 1.8})`;
        ctx.beginPath();
        ctx.arc(bestContact.point.x, bestContact.point.y, bestContact.point.soma ? 2.4 : 1.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (let i = 0; i < neurons.length; i += 1) {
      const neuron = neurons[i];
      const decay = clamp((time - neuron.last) / neuron.life, 0, 1);
      const alpha = ease(1 - decay);
      const hillockX = neuron.x + Math.cos(neuron.axon.angle) * neuron.size * 0.9;
      const hillockY = neuron.y + Math.sin(neuron.axon.angle) * neuron.size * 0.72;
      ctx.fillStyle = neuron.validated
        ? `rgba(180, 204, 208, ${0.36 * alpha})`
        : `rgba(123, 71, 41, ${0.56 * alpha})`;
      ctx.beginPath();
      ctx.ellipse(neuron.x, neuron.y, neuron.size * 1.08, neuron.size * 0.92, neuron.axon.angle * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 248, 238, ${0.38 * alpha})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.strokeStyle = `rgba(157, 91, 50, ${0.2 * alpha})`;
      ctx.lineWidth = 1.05;
      ctx.beginPath();
      ctx.moveTo(neuron.x, neuron.y);
      ctx.lineTo(hillockX, hillockY);
      ctx.stroke();
      ctx.fillStyle = `rgba(33, 20, 13, ${0.17 * alpha})`;
      ctx.beginPath();
      ctx.arc(neuron.x + Math.cos(neuron.axon.angle + 0.8) * neuron.size * 0.18, neuron.y + Math.sin(neuron.axon.angle + 0.8) * neuron.size * 0.18, neuron.size * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
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
    const pointerActive = this.pointer.active && this.pointer.strength > 0.018;
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
        ctx.fillStyle = `rgba(180, 204, 208, ${0.08 + pulseAlpha * 0.38})`;
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
          ctx.fillStyle = `rgba(180, 204, 208, ${pulseAlpha * 0.16})`;
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
          ctx.fillStyle = `rgba(180, 204, 208, ${branchPulseAlpha * 0.12})`;
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
            ctx.fillStyle = `rgba(180, 204, 208, ${pulseAlpha * 0.16})`;
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
        ? `rgba(180, 204, 208, ${(0.2 + activity * 0.32) * lifeAlpha})`
        : `rgba(180, 204, 208, ${0.02 + activity * 0.055})`;
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
    ray.x = distribute
      ? lerp(-this.width * 0.08, this.width * 1.05, rand())
      : -34 - rand() * 84;
    const laneY = this.height * (0.1 + ray.lane * 0.8);
    ray.y = laneY + (rand() - 0.5) * this.height * 0.035;
    const angle = (rand() - 0.5) * 0.18;
    const speed = 136 + rand() * 66;
    ray.baseVx = Math.cos(angle) * speed;
    ray.baseVy = Math.sin(angle) * speed;
    ray.vx = ray.baseVx;
    ray.vy = ray.baseVy;
    ray.trail.length = 0;
    ray.captured = false;
    ray.captureAge = 0;
    ray.nearMiss = false;
    ray.brightness = 0.5 + rand() * 0.5;
  }

  drawKerr(ctx, time, dt) {
    const lensX = this.pointer.active ? this.pointer.x : this.width * 0.58;
    const lensY = this.pointer.active ? this.pointer.y : this.height * 0.5;
    const pointerStrength = this.pointer.strength;
    const weakImpactRadius = 70 + pointerStrength * 54;
    const strongImpactRadius = 24 + pointerStrength * 18;
    const alongRadius = 152 + pointerStrength * 62;
    const captureRadius = 6 + pointerStrength * 9;
    const lensStrength = 138 + pointerStrength * 590;
    const maxSpeed = 265;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const glow = ctx.createRadialGradient(lensX, lensY, 0, lensX, lensY, 165);
    glow.addColorStop(0, `rgba(45, 27, 18, ${0.08 + pointerStrength * 0.08})`);
    glow.addColorStop(0.22, `rgba(157, 91, 50, ${0.07 + pointerStrength * 0.09})`);
    glow.addColorStop(0.52, `rgba(210, 161, 95, ${0.055 + pointerStrength * 0.065})`);
    glow.addColorStop(1, "rgba(210, 161, 95, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(lensX - 165, lensY - 165, 330, 330);

    this.scene.rays.forEach((ray, index) => {
      if (ray.captured) {
        ray.captureAge += dt;
        const angle = ray.phase + ray.captureAge * (3.8 + (index % 3));
        const radius = Math.max(2, 26 * (1 - ray.captureAge / 1.2));
        ray.x = lensX + Math.cos(angle) * radius;
        ray.y = lensY + Math.sin(angle) * radius * 0.72;
      } else {
        const dx = lensX - ray.x;
        const dy = lensY - ray.y;
        const dist = Math.max(1, Math.hypot(dx, dy));
        let speed = Math.max(1, Math.hypot(ray.vx, ray.vy));
        const dirX = ray.vx / speed;
        const dirY = ray.vy / speed;
        const along = dx * dirX + dy * dirY;
        const impact = Math.abs(dx * dirY - dy * dirX);
        const aheadWindow = along > -42 ? 1 : ease(1 - Math.abs(along + 42) / 78);
        const longitudinalWindow = ease(1 - Math.abs(along) / alongRadius) * aheadWindow;
        const weakWindow = ease(1 - impact / weakImpactRadius);
        const strongWindow = ease(1 - impact / strongImpactRadius);
        const fieldInfluence = longitudinalWindow * (weakWindow * 0.22 + strongWindow * 0.78);
        if (fieldInfluence > 0.001) {
          const perpSign = Math.sign(dy * dirX - dx * dirY) || 1;
          const closeBoost = ease(1 - dist / (strongImpactRadius * 1.8));
          const accel = lensStrength * fieldInfluence * (0.72 + closeBoost * 0.9);
          ray.vx += -dirY * perpSign * accel * dt;
          ray.vy += dirX * perpSign * accel * dt;
        }
        const hasPassedLens = along < -70;
        const relax = hasPassedLens
          ? 0.045
          : 0.008 + (1 - weakWindow) * 0.035;
        ray.vx = lerp(ray.vx, ray.baseVx, relax);
        ray.vy = lerp(ray.vy, ray.baseVy, relax);
        speed = Math.hypot(ray.vx, ray.vy);
        if (speed > maxSpeed) {
          ray.vx = (ray.vx / speed) * maxSpeed;
          ray.vy = (ray.vy / speed) * maxSpeed;
        }
        ray.x += ray.vx * dt;
        ray.y += ray.vy * dt;
        const approach = ((ray.vx * dx + ray.vy * dy) / Math.max(speed * dist, 1));
        if (
          pointerStrength > 0.24 &&
          dist < captureRadius &&
          impact < captureRadius * 1.35 &&
          approach > 0.22
        ) {
          ray.captured = true;
          ray.captureAge = 0;
          ray.vx = 0;
          ray.vy = 0;
        }
      }

      ray.trail.push({ x: ray.x, y: ray.y, captured: ray.captured });
      if (ray.trail.length > 46) {
        ray.trail.shift();
      }
      if (
        ray.x > this.width + 55 ||
        ray.x < -this.width * 0.48 ||
        ray.y < -80 ||
        ray.y > this.height + 80 ||
        ray.captureAge > 1.15
      ) {
        this.spawnKerrRay(ray, Math.random, false);
      }

      ctx.beginPath();
      let started = false;
      ray.trail.forEach((point) => {
        if (!started) {
          ctx.moveTo(point.x, point.y);
          started = true;
        } else {
          ctx.lineTo(point.x, point.y);
        }
      });
      const tailAlpha = ray.captured ? Math.max(0, 1 - ray.captureAge / 1.15) : 1;
      ctx.strokeStyle = ray.tone === 2
        ? `rgba(180, 204, 208, ${0.32 * ray.brightness * tailAlpha})`
        : ray.tone === 1
        ? `rgba(157, 91, 50, ${0.62 * ray.brightness * tailAlpha})`
        : `rgba(210, 161, 95, ${0.66 * ray.brightness * tailAlpha})`;
      ctx.lineWidth = ray.tone === 0 ? 2.35 : 1.45 + (ray.tone % 2) * 0.34;
      ctx.stroke();

      ctx.fillStyle = ray.tone === 2
        ? `rgba(180, 204, 208, ${0.44 * tailAlpha})`
        : `rgba(255, 231, 187, ${0.52 * tailAlpha})`;
      ctx.beginPath();
      ctx.arc(ray.x, ray.y, ray.captured ? 1.7 : 2.2, 0, Math.PI * 2);
      ctx.fill();
    });

    if (pointerStrength > 0.035) {
      ctx.strokeStyle = `rgba(123, 71, 41, ${0.2 + pointerStrength * 0.18})`;
      ctx.lineWidth = 1.05;
      ctx.beginPath();
      ctx.ellipse(lensX, lensY, 28 + pointerStrength * 18, 22 + pointerStrength * 12, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(210, 161, 95, ${0.13 * pointerStrength})`;
      ctx.setLineDash([5, 9]);
      ctx.beginPath();
      ctx.arc(lensX, lensY, 64, -0.7, 0.95);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  laneY(lane) {
    const count = this.scene.lanes;
    const gap = Math.min(58, this.height * 0.115);
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
        ? "rgba(180, 204, 208, 0.46)"
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

  spawnSupplement(time) {
    if (!this.pointer.active || !this.scene || time - this.scene.lastSpawn < 0.13) {
      return;
    }
    this.scene.lastSpawn = time;
    const types = ["capsule", "tablet", "bottle", "doc", "shield", "warning", "check", "lab", "product", "profile"];
    const index = Math.floor((time * 17 + this.pointer.x * 0.03 + this.pointer.y * 0.02) % types.length);
    const angle = time * 2.1 + index * 0.7;
    this.scene.symbols.push({
      type: types[index],
      x: this.pointer.x + Math.cos(angle) * 24,
      y: this.pointer.y + Math.sin(angle) * 18,
      born: time,
      life: 1.9 + (index % 4) * 0.34,
      lane: index % 4,
      phase: angle,
    });
    if (this.scene.symbols.length > 34) {
      this.scene.symbols.shift();
    }
  }

  drawSupplement(ctx, time) {
    this.spawnSupplement(time);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    this.scene.idle.forEach((item) => {
      const x = item.x * this.width + Math.sin(time * 0.18 * item.drift + item.phase) * 12;
      const y = item.y * this.height + Math.cos(time * 0.16 * item.drift + item.phase) * 9;
      const focus = this.pointer.active
        ? ease(1 - Math.hypot(this.pointer.x - x, this.pointer.y - y) / 150) * this.pointer.strength
        : 0;
      const towardX = lerp(x, this.pointer.x, focus * 0.08);
      const towardY = lerp(y, this.pointer.y, focus * 0.08);
      this.drawSupplementSymbol(ctx, item.type, towardX, towardY, 0.08 + focus * 0.18, item.size + focus * 0.12, item.phase * 0.16);
    });

    if (this.pointer.strength > 0.035) {
      const x = this.pointer.x;
      const y = this.pointer.y;
      const alpha = this.pointer.strength;
      ctx.strokeStyle = `rgba(157, 91, 50, ${0.15 * alpha})`;
      ctx.lineWidth = 1.15;
      ctx.beginPath();
      ctx.arc(x, y, 82, -1.2, 1.05);
      ctx.arc(x, y, 116, 2.15, 4.05);
      ctx.stroke();
      ctx.strokeStyle = `rgba(180, 204, 208, ${0.12 * alpha})`;
      ctx.setLineDash([3, 9]);
      ctx.beginPath();
      ctx.moveTo(x - 106, y + 88);
      ctx.quadraticCurveTo(x - 12, y + 116, x + 102, y + 84);
      ctx.stroke();
      ctx.setLineDash([]);
      this.drawSupplementSymbol(ctx, "shield", x - 42, y - 40, 0.22 * alpha, 0.78, 0);
    }

    this.scene.symbols = this.scene.symbols.filter((symbol) => time - symbol.born < symbol.life);
    this.scene.symbols.forEach((symbol) => {
      const age = time - symbol.born;
      const progress = clamp(age / symbol.life, 0, 1);
      const fade = Math.sin(progress * Math.PI);
      const orbit = symbol.phase + progress * Math.PI * 1.15;
      const radius = 24 + symbol.lane * 14;
      let targetX = symbol.x + Math.cos(orbit) * radius;
      let targetY = symbol.y + Math.sin(orbit) * radius * 0.62;
      if (progress > 0.28) {
        const route = this.supplementRoute(symbol.type, symbol.x, symbol.y);
        const mix = ease((progress - 0.28) / 0.72);
        targetX = lerp(targetX, route.x, mix);
        targetY = lerp(targetY, route.y, mix);
      }
      this.drawSupplementSymbol(ctx, symbol.type, targetX, targetY, 0.58 * fade, 0.88 + fade * 0.16, orbit * 0.12);
    });
    ctx.restore();
  }

  supplementRoute(type, x, y) {
    if (type === "warning") {
      return { x: x - 94, y: y + 46 };
    }
    if (type === "doc" || type === "lab") {
      return { x: x + 76, y: y - 44 };
    }
    if (type === "product") {
      return { x: x + 70, y: y + 92 };
    }
    if (type === "shield" || type === "profile") {
      return { x: x - 30, y: y - 72 };
    }
    if (type === "check") {
      return { x: x + 96, y: y + 8 };
    }
    return { x: x + 54, y: y + 18 };
  }

  drawSupplementSymbol(ctx, type, x, y, alpha, scale = 1, angle = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    ctx.strokeStyle =
      type === "warning"
        ? `rgba(146, 90, 53, ${alpha})`
        : type === "product"
        ? `rgba(103, 84, 71, ${alpha * 0.58})`
        : type === "check" || type === "shield"
        ? `rgba(157, 91, 50, ${alpha})`
        : type === "lab" || type === "profile"
        ? `rgba(180, 204, 208, ${alpha * 0.78})`
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
    } else if (type === "tablet") {
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.moveTo(-6, 0);
      ctx.lineTo(6, 0);
      ctx.stroke();
    } else if (type === "bottle") {
      ctx.beginPath();
      ctx.moveTo(-5, -14);
      ctx.lineTo(5, -14);
      ctx.moveTo(-3, -14);
      ctx.lineTo(-3, -8);
      ctx.lineTo(-8, -2);
      ctx.lineTo(-8, 12);
      ctx.lineTo(8, 12);
      ctx.lineTo(8, -2);
      ctx.lineTo(3, -8);
      ctx.lineTo(3, -14);
      ctx.moveTo(-5, 2);
      ctx.lineTo(5, 2);
      ctx.stroke();
    } else if (type === "doc" || type === "product") {
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
    } else if (type === "lab") {
      ctx.beginPath();
      ctx.moveTo(-5, -12);
      ctx.lineTo(5, -12);
      ctx.moveTo(-2, -12);
      ctx.lineTo(-2, 1);
      ctx.lineTo(-9, 13);
      ctx.lineTo(9, 13);
      ctx.lineTo(2, 1);
      ctx.lineTo(2, -12);
      ctx.moveTo(-5, 6);
      ctx.lineTo(5, 6);
      ctx.stroke();
    } else if (type === "profile") {
      ctx.beginPath();
      ctx.arc(0, -5, 4.5, 0, Math.PI * 2);
      ctx.moveTo(-9, 11);
      ctx.quadraticCurveTo(0, 2, 9, 11);
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
    this.projectVisual?.setMode(meta.mode);
    return true;
  }

  scrollStageIntoView() {
    if (!this.drawer) {
      return;
    }
    const offset = 86;
    const target = this.drawer.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({
      top: Math.max(0, target),
      behavior: reducedMotionQuery.matches ? "auto" : "smooth",
    });
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
      this.drawer.classList.add("is-activating");
      this.projectVisual?.resize();
      this.projectVisual?.syncLoop();
      if (options.scrollToStage !== false) {
        this.scrollStageIntoView();
      }
      window.setTimeout(() => {
        this.drawer?.classList.remove("is-activating");
        this.drawerTitle?.focus({ preventScroll: true });
      }, reducedMotionQuery.matches ? 0 : 320);
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
