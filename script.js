const revealItems = Array.from(document.querySelectorAll(".reveal"));
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
const cursorDot = document.getElementById("cur");
const cursorRing = document.getElementById("cur-ring");
const tracePanel = document.querySelector("[data-trace-panel]");
const systemsCanvas = tracePanel?.querySelector(".systems-canvas") ?? null;
const heroIndexLinks = Array.from(
  document.querySelectorAll("[data-project-link]")
);
const projectCards = Array.from(document.querySelectorAll(".featured-card[id]"));
const projectButtons = Array.from(
  document.querySelectorAll(".project-card-button[data-project]")
);
const projectDrawer = document.getElementById("project-drawer");
const drawerTitle = document.getElementById("project-drawer-title");
const drawerStage = document.getElementById("project-drawer-content");
const drawerClose = document.querySelector(".drawer-close");
const projectTemplates = new Map(
  Array.from(document.querySelectorAll("[data-project-template]")).map(
    (template) => [template.dataset.projectTemplate, template]
  )
);
const interactiveSelector = "a, button";

let cursorEnabled = false;
let cursorVisible = false;
let pointerSeen = false;
let mouseX = 0;
let mouseY = 0;
let ringX = 0;
let ringY = 0;
let ringFrame = 0;

let activeProject = null;
let closeDrawerTimer = 0;

let systemsContext = null;
let systemsScene = null;
let systemsFrame = 0;
let systemsInView = true;
let systemsResizing = 0;
const systemsPointer = {
  x: 0,
  y: 0,
  active: false,
};

const projectMeta = projectButtons.reduce((map, button) => {
  const card = button.closest(".featured-card");
  const title = button.querySelector(".project-card-title")?.textContent?.trim();
  if (card && title) {
    map.set(button.dataset.project, {
      id: button.dataset.project,
      card,
      button,
      title,
    });
  }
  return map;
}, new Map());

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function setCurrentHeroProject(projectId) {
  if (!heroIndexLinks.length) {
    return;
  }

  let matched = false;

  heroIndexLinks.forEach((link) => {
    const isMatch = link.dataset.projectLink === projectId;
    link.classList.toggle("is-current", isMatch);
    matched ||= isMatch;
  });

  if (!matched) {
    heroIndexLinks.forEach((link, index) => {
      link.classList.toggle("is-current", index === 0);
    });
  }
}

function setRingPosition(x, y) {
  if (!cursorRing) {
    return;
  }

  const ringHalfWidth = cursorRing.offsetWidth / 2;
  const ringHalfHeight = cursorRing.offsetHeight / 2;
  cursorRing.style.transform = `translate3d(${x - ringHalfWidth}px, ${
    y - ringHalfHeight
  }px, 0)`;
}

function setDotPosition(x, y) {
  if (!cursorDot) {
    return;
  }

  cursorDot.style.transform = `translate3d(${x - 4}px, ${y - 4}px, 0)`;
}

function animateRing() {
  if (!cursorEnabled || !cursorRing) {
    ringFrame = 0;
    return;
  }

  const easing = document.body.classList.contains("hov") ? 0.24 : 0.18;
  ringX += (mouseX - ringX) * easing;
  ringY += (mouseY - ringY) * easing;
  setRingPosition(ringX, ringY);
  ringFrame = window.requestAnimationFrame(animateRing);
}

function startRingLoop() {
  if (!ringFrame) {
    ringFrame = window.requestAnimationFrame(animateRing);
  }
}

function stopRingLoop() {
  if (ringFrame) {
    window.cancelAnimationFrame(ringFrame);
    ringFrame = 0;
  }
}

function resetTracePanel() {
  if (!tracePanel) {
    return;
  }

  tracePanel.style.setProperty("--scan-x", "72%");
  tracePanel.style.setProperty("--scan-y", "46%");
}

function showCursor() {
  if (!cursorEnabled || cursorVisible) {
    return;
  }

  cursorVisible = true;
  document.body.classList.add("cursor-visible");
}

function hideCursor() {
  cursorVisible = false;
  pointerSeen = false;
  document.body.classList.remove("cursor-visible", "hov", "trace-hot");
  stopRingLoop();
  systemsPointer.active = false;
  resetTracePanel();
}

function handlePointerMove(event) {
  if (!cursorEnabled || !cursorDot || !cursorRing) {
    return;
  }

  mouseX = event.clientX;
  mouseY = event.clientY;
  setDotPosition(mouseX, mouseY);

  if (!pointerSeen) {
    ringX = mouseX;
    ringY = mouseY;
    setRingPosition(ringX, ringY);
    pointerSeen = true;
  }

  showCursor();
  startRingLoop();
}

function isInteractiveTarget(node) {
  return Boolean(node?.closest?.(interactiveSelector));
}

function handleHoverOver(event) {
  if (!cursorEnabled || !isInteractiveTarget(event.target)) {
    return;
  }

  document.body.classList.add("hov");
}

function handleHoverOut(event) {
  if (!isInteractiveTarget(event.target)) {
    return;
  }

  if (isInteractiveTarget(event.relatedTarget)) {
    return;
  }

  document.body.classList.remove("hov");
}

function handleTraceMove(event) {
  if (!tracePanel) {
    return;
  }

  const rect = tracePanel.getBoundingClientRect();
  const x = clamp(event.clientX - rect.left, 0, rect.width);
  const y = clamp(event.clientY - rect.top, 0, rect.height);
  tracePanel.style.setProperty("--scan-x", `${x}px`);
  tracePanel.style.setProperty("--scan-y", `${y}px`);
  systemsPointer.x = x;
  systemsPointer.y = y;
}

function handleTraceEnter() {
  if (!cursorEnabled) {
    return;
  }

  systemsPointer.active = true;
  document.body.classList.add("trace-hot");
}

function handleTraceLeave() {
  systemsPointer.active = false;
  document.body.classList.remove("trace-hot");
  resetTracePanel();
}

function enableCursor() {
  if (cursorEnabled || !cursorDot || !cursorRing) {
    return;
  }

  cursorEnabled = true;
  document.body.classList.add("cursor-enabled");
  document.addEventListener("pointermove", handlePointerMove, { passive: true });
  document.addEventListener("pointerover", handleHoverOver, { passive: true });
  document.addEventListener("pointerout", handleHoverOut, { passive: true });

  if (tracePanel) {
    tracePanel.addEventListener("pointerenter", handleTraceEnter);
    tracePanel.addEventListener("pointerleave", handleTraceLeave);
    tracePanel.addEventListener("pointermove", handleTraceMove, {
      passive: true,
    });
  }
}

function disableCursor() {
  if (!cursorEnabled) {
    return;
  }

  cursorEnabled = false;
  hideCursor();
  document.body.classList.remove("cursor-enabled");
  document.removeEventListener("pointermove", handlePointerMove);
  document.removeEventListener("pointerover", handleHoverOver);
  document.removeEventListener("pointerout", handleHoverOut);

  if (tracePanel) {
    tracePanel.removeEventListener("pointerenter", handleTraceEnter);
    tracePanel.removeEventListener("pointerleave", handleTraceLeave);
    tracePanel.removeEventListener("pointermove", handleTraceMove);
  }

  if (cursorDot) {
    cursorDot.style.transform = "translate3d(-120px, -120px, 0)";
  }

  if (cursorRing) {
    cursorRing.style.transform = "translate3d(-120px, -120px, 0)";
  }
}

function syncCursorMode() {
  const shouldEnableCursor =
    !prefersReducedMotion.matches && finePointer.matches && window.innerWidth > 860;

  if (shouldEnableCursor) {
    enableCursor();
    return;
  }

  disableCursor();
}

function subscribeMedia(queryList, listener) {
  if (typeof queryList.addEventListener === "function") {
    queryList.addEventListener("change", listener);
    return;
  }

  if (typeof queryList.addListener === "function") {
    queryList.addListener(listener);
  }
}

function hashSeed(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  return function next() {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function cubicPoint(lane, t) {
  const inv = 1 - t;
  const inv2 = inv * inv;
  const inv3 = inv2 * inv;
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x:
      inv3 * lane.p0.x +
      3 * inv2 * t * lane.p1.x +
      3 * inv * t2 * lane.p2.x +
      t3 * lane.p3.x,
    y:
      inv3 * lane.p0.y +
      3 * inv2 * t * lane.p1.y +
      3 * inv * t2 * lane.p2.y +
      t3 * lane.p3.y,
  };
}

function cubicTangent(lane, t) {
  const inv = 1 - t;
  return {
    x:
      3 * inv * inv * (lane.p1.x - lane.p0.x) +
      6 * inv * t * (lane.p2.x - lane.p1.x) +
      3 * t * t * (lane.p3.x - lane.p2.x),
    y:
      3 * inv * inv * (lane.p1.y - lane.p0.y) +
      6 * inv * t * (lane.p2.y - lane.p1.y) +
      3 * t * t * (lane.p3.y - lane.p2.y),
  };
}

function createLaneSamples(lane, count = 18) {
  return Array.from({ length: count }, (_, index) =>
    cubicPoint(lane, index / (count - 1))
  );
}

function getLaneHotness(lane) {
  if (!systemsPointer.active || prefersReducedMotion.matches) {
    return 0;
  }

  let minDistance = Infinity;
  lane.samples.forEach((sample) => {
    const dx = sample.x - systemsPointer.x;
    const dy = sample.y - systemsPointer.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < minDistance) {
      minDistance = distance;
    }
  });

  return clamp(1 - minDistance / 180, 0, 1);
}

function buildSystemsScene(width, height) {
  const compact = width < 760;
  const seed = hashSeed(`${Math.round(width)}x${Math.round(height)}-systems`);
  const rand = mulberry32(seed);

  const nodes = [
    {
      x: width * 0.52,
      y: height * 0.46,
      radius: compact ? 11 : 13,
      glow: compact ? 56 : 78,
    },
    {
      x: width * 0.71,
      y: height * 0.48,
      radius: compact ? 9 : 11,
      glow: compact ? 42 : 58,
    },
    {
      x: width * 0.89,
      y: height * 0.3,
      radius: compact ? 6.5 : 8,
      glow: compact ? 24 : 34,
    },
    {
      x: width * 0.93,
      y: height * 0.74,
      radius: compact ? 6.5 : 8,
      glow: compact ? 24 : 34,
    },
  ];

  const baseLaneCount = compact ? 18 : 26;
  const branchLaneCount = compact ? 8 : 12;
  const lanes = [];

  for (let index = 0; index < baseLaneCount; index += 1) {
    const ratio = baseLaneCount === 1 ? 0 : index / (baseLaneCount - 1);
    const startY = height * (0.1 + ratio * 0.78 + (rand() - 0.5) * 0.03);
    const upperBand = ratio < 0.42;
    const lowerBand = ratio > 0.58;
    const endYBase = upperBand
      ? height * (0.12 + ratio * 0.42)
      : lowerBand
      ? height * (0.54 + (ratio - 0.58) * 0.62)
      : height * (0.44 + (ratio - 0.5) * 0.18);
    const endY = clamp(endYBase + (rand() - 0.5) * height * 0.05, height * 0.06, height * 0.94);
    const c1 = {
      x: width * (0.26 + rand() * 0.16),
      y: startY + (nodes[0].y - startY) * (0.24 + rand() * 0.18),
    };
    const c2 = {
      x: width * (0.58 + rand() * 0.14),
      y: endY + (nodes[1].y - endY) * (0.18 + rand() * 0.2),
    };

    const lane = {
      p0: { x: width * (0.02 + rand() * 0.08), y: startY },
      p1: c1,
      p2: c2,
      p3: { x: width * (0.86 + rand() * 0.15), y: endY },
      width: 0.9 + rand() * 0.7,
      alpha: 0.14 + rand() * 0.12,
      warm: index % 3 !== 0,
      bright: index % 4 === 0,
      dashes: index % 5 === 0,
      packets: [],
    };

    const packetCount = compact ? 1 + Math.floor(rand() * 2) : 2 + Math.floor(rand() * 3);
    for (let packetIndex = 0; packetIndex < packetCount; packetIndex += 1) {
      lane.packets.push({
        offset: rand(),
        speed: 0.018 + rand() * 0.024,
        count: 2 + Math.floor(rand() * 3),
        gap: 0.028 + rand() * 0.018,
        size: 6 + rand() * 8,
        thickness: 1.4 + rand() * 1.8,
        cool: rand() > 0.92,
        light: rand() > 0.58,
      });
    }

    lane.samples = createLaneSamples(lane);
    lanes.push(lane);
  }

  for (let index = 0; index < branchLaneCount; index += 1) {
    const upward = index % 2 === 0;
    const anchor = upward ? nodes[1] : nodes[0];
    const lane = {
      p0: {
        x: anchor.x - width * (0.08 + rand() * 0.06),
        y: anchor.y + (rand() - 0.5) * height * 0.14,
      },
      p1: {
        x: anchor.x + width * (0.04 + rand() * 0.06),
        y: anchor.y + (upward ? -1 : 1) * height * (0.06 + rand() * 0.1),
      },
      p2: {
        x: width * (0.78 + rand() * 0.08),
        y: height * (upward ? 0.2 + rand() * 0.12 : 0.62 + rand() * 0.18),
      },
      p3: {
        x: width * (0.9 + rand() * 0.08),
        y: height * (upward ? 0.1 + rand() * 0.12 : 0.74 + rand() * 0.16),
      },
      width: 0.8 + rand() * 0.55,
      alpha: 0.12 + rand() * 0.1,
      warm: rand() > 0.2,
      bright: rand() > 0.75,
      dashes: rand() > 0.6,
      packets: [],
    };

    if (rand() > 0.42) {
      lane.packets.push({
        offset: rand(),
        speed: 0.016 + rand() * 0.02,
        count: 2 + Math.floor(rand() * 2),
        gap: 0.032 + rand() * 0.02,
        size: 5 + rand() * 6,
        thickness: 1.2 + rand() * 1.3,
        cool: rand() > 0.94,
        light: rand() > 0.46,
      });
    }

    lane.samples = createLaneSamples(lane, 16);
    lanes.push(lane);
  }

  const lattice = Array.from({ length: compact ? 120 : 220 }, () => ({
    x: width * (0.42 + rand() * 0.56),
    y: height * (0.06 + rand() * 0.88),
    radius: rand() > 0.84 ? 1.1 : 0.7,
    alpha: 0.08 + rand() * 0.12,
  }));

  const guides = Array.from({ length: compact ? 6 : 10 }, (_, index) => ({
    y: height * (0.16 + index * 0.08 + (rand() - 0.5) * 0.02),
    x1: width * (0.08 + rand() * 0.08),
    x2: width * (0.8 + rand() * 0.18),
  }));

  const segments = Array.from({ length: compact ? 92 : 156 }, () => ({
    x: width * (0.46 + rand() * 0.5),
    y: height * (0.1 + rand() * 0.8),
    w: 6 + rand() * 14,
    h: rand() > 0.58 ? 2 : 3,
    alpha: 0.14 + rand() * 0.22,
    cool: rand() > 0.93,
    light: rand() > 0.52,
    phase: rand() * Math.PI * 2,
  }));

  return {
    width,
    height,
    compact,
    nodes,
    lanes,
    lattice,
    guides,
    segments,
  };
}

function strokeLane(ctx, lane, color, width, alpha, dashPattern, dashOffset = 0) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (dashPattern) {
    ctx.setLineDash(dashPattern);
    ctx.lineDashOffset = dashOffset;
  } else {
    ctx.setLineDash([]);
  }
  ctx.beginPath();
  ctx.moveTo(lane.p0.x, lane.p0.y);
  ctx.bezierCurveTo(
    lane.p1.x,
    lane.p1.y,
    lane.p2.x,
    lane.p2.y,
    lane.p3.x,
    lane.p3.y
  );
  ctx.stroke();
  ctx.restore();
}

function drawPacket(ctx, lane, packet, time, boost) {
  const motion = prefersReducedMotion.matches ? 0 : time * packet.speed;
  const start = (packet.offset + motion) % 1;
  for (let index = 0; index < packet.count; index += 1) {
    const t = start - index * packet.gap;
    if (t <= 0 || t >= 1) {
      continue;
    }
    const point = cubicPoint(lane, t);
    const tangent = cubicTangent(lane, t);
    const angle = Math.atan2(tangent.y, tangent.x);
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(angle);
    ctx.globalAlpha =
      (packet.light ? 0.84 : 0.54) + boost * (packet.light ? 0.18 : 0.28);
    ctx.fillStyle = packet.cool
      ? "rgba(168, 207, 209, 0.78)"
      : packet.light
      ? "rgba(255, 248, 240, 0.92)"
      : "rgba(169, 103, 59, 0.82)";
    ctx.fillRect(
      -packet.size * 0.5,
      -packet.thickness * 0.5,
      packet.size,
      packet.thickness
    );
    ctx.restore();
  }
}

function drawSystemsField(timeStamp = 0) {
  if (!systemsContext || !systemsScene || !systemsCanvas || !tracePanel) {
    return;
  }

  const width = systemsScene.width;
  const height = systemsScene.height;
  const time = timeStamp * 0.001;
  const ctx = systemsContext;
  ctx.clearRect(0, 0, width, height);

  const wash = ctx.createRadialGradient(
    width * 0.67,
    height * 0.44,
    12,
    width * 0.67,
    height * 0.44,
    width * 0.38
  );
  wash.addColorStop(0, "rgba(201, 141, 98, 0.18)");
  wash.addColorStop(0.38, "rgba(255, 250, 241, 0.18)");
  wash.addColorStop(1, "rgba(255, 250, 241, 0)");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, width, height);

  systemsScene.lattice.forEach((dot) => {
    ctx.beginPath();
    ctx.fillStyle = `rgba(138, 90, 55, ${dot.alpha})`;
    ctx.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2);
    ctx.fill();
  });

  systemsScene.guides.forEach((guide, index) => {
    ctx.save();
    ctx.strokeStyle = "rgba(169, 103, 59, 0.11)";
    ctx.lineWidth = 1;
    ctx.setLineDash(index % 2 === 0 ? [2, 11] : [1, 13]);
    ctx.beginPath();
    ctx.moveTo(guide.x1, guide.y);
    ctx.lineTo(guide.x2, guide.y);
    ctx.stroke();
    ctx.restore();
  });

  systemsScene.segments.forEach((segment) => {
    const glow = prefersReducedMotion.matches
      ? 0
      : (Math.sin(time * 0.8 + segment.phase) + 1) * 0.5;
    ctx.fillStyle = segment.cool
      ? `rgba(168, 207, 209, ${0.18 + glow * 0.18})`
      : segment.light
      ? `rgba(255, 248, 240, ${segment.alpha + glow * 0.18})`
      : `rgba(169, 103, 59, ${segment.alpha + glow * 0.12})`;
    ctx.fillRect(segment.x, segment.y, segment.w, segment.h);
  });

  systemsScene.lanes.forEach((lane, index) => {
    const hotness = getLaneHotness(lane);
    const dashOffset = prefersReducedMotion.matches ? 0 : time * (16 + index * 0.35);
    strokeLane(
      ctx,
      lane,
      lane.warm ? "rgba(169, 103, 59, 0.42)" : "rgba(226, 180, 140, 0.42)",
      lane.width,
      lane.alpha + hotness * 0.12,
      lane.dashes ? [4, 14] : null,
      dashOffset
    );

    if (lane.bright) {
      strokeLane(
        ctx,
        lane,
        "rgba(255, 248, 240, 0.82)",
        lane.width + 0.7 + hotness * 0.4,
        0.16 + hotness * 0.34,
        prefersReducedMotion.matches ? null : [18, 28, 6, 18],
        prefersReducedMotion.matches ? 0 : -time * (28 + index)
      );
    }

    lane.packets.forEach((packet) => {
      drawPacket(ctx, lane, packet, time, hotness);
    });
  });

  systemsScene.nodes.forEach((node) => {
    const dx = systemsPointer.x - node.x;
    const dy = systemsPointer.y - node.y;
    const pointerBoost =
      systemsPointer.active && !prefersReducedMotion.matches
        ? clamp(1 - Math.sqrt(dx * dx + dy * dy) / 180, 0, 1)
        : 0;

    const glow = ctx.createRadialGradient(
      node.x,
      node.y,
      0,
      node.x,
      node.y,
      node.glow + pointerBoost * 34
    );
    glow.addColorStop(0, `rgba(255, 249, 242, ${0.96 + pointerBoost * 0.04})`);
    glow.addColorStop(0.2, `rgba(255, 244, 234, ${0.4 + pointerBoost * 0.18})`);
    glow.addColorStop(0.6, `rgba(201, 141, 98, ${0.18 + pointerBoost * 0.1})`);
    glow.addColorStop(1, "rgba(201, 141, 98, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.glow + pointerBoost * 34, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.strokeStyle = `rgba(255, 248, 240, ${0.58 + pointerBoost * 0.24})`;
    ctx.lineWidth = 1.2;
    ctx.arc(node.x, node.y, node.radius + 6 + pointerBoost * 3, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.fillStyle = `rgba(255, 249, 242, ${0.92 + pointerBoost * 0.08})`;
    ctx.arc(node.x, node.y, node.radius * 0.7, 0, Math.PI * 2);
    ctx.fill();
  });

  if (systemsPointer.active && !prefersReducedMotion.matches) {
    const pointerGlow = ctx.createRadialGradient(
      systemsPointer.x,
      systemsPointer.y,
      0,
      systemsPointer.x,
      systemsPointer.y,
      120
    );
    pointerGlow.addColorStop(0, "rgba(255, 248, 240, 0.2)");
    pointerGlow.addColorStop(0.38, "rgba(201, 141, 98, 0.12)");
    pointerGlow.addColorStop(1, "rgba(201, 141, 98, 0)");
    ctx.fillStyle = pointerGlow;
    ctx.fillRect(0, 0, width, height);
  }
}

function shouldAnimateSystemsField() {
  return (
    !prefersReducedMotion.matches &&
    systemsInView &&
    !document.hidden &&
    Boolean(systemsScene)
  );
}

function stopSystemsLoop() {
  if (systemsFrame) {
    window.cancelAnimationFrame(systemsFrame);
    systemsFrame = 0;
  }
}

function runSystemsLoop(timeStamp) {
  drawSystemsField(timeStamp);
  if (!shouldAnimateSystemsField()) {
    systemsFrame = 0;
    return;
  }
  systemsFrame = window.requestAnimationFrame(runSystemsLoop);
}

function syncSystemsLoop() {
  if (!systemsScene) {
    return;
  }

  if (shouldAnimateSystemsField()) {
    if (!systemsFrame) {
      systemsFrame = window.requestAnimationFrame(runSystemsLoop);
    }
    return;
  }

  stopSystemsLoop();
  drawSystemsField(0);
}

function resizeSystemsField() {
  if (!tracePanel || !systemsCanvas) {
    return;
  }

  if (!systemsContext) {
    systemsContext = systemsCanvas.getContext("2d");
  }

  const rect = tracePanel.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const ratio = clamp(window.devicePixelRatio || 1, 1, 2);

  systemsCanvas.width = Math.round(width * ratio);
  systemsCanvas.height = Math.round(height * ratio);
  systemsCanvas.style.width = `${width}px`;
  systemsCanvas.style.height = `${height}px`;

  systemsContext.setTransform(ratio, 0, 0, ratio, 0, 0);
  systemsScene = buildSystemsScene(width, height);

  if (!systemsPointer.active) {
    systemsPointer.x = width * 0.72;
    systemsPointer.y = height * 0.46;
  }

  drawSystemsField(0);
  syncSystemsLoop();
}

function queueSystemsResize() {
  if (systemsResizing) {
    window.cancelAnimationFrame(systemsResizing);
  }
  systemsResizing = window.requestAnimationFrame(() => {
    systemsResizing = 0;
    resizeSystemsField();
  });
}

function setupSystemsField() {
  if (!tracePanel || !systemsCanvas) {
    return;
  }

  resizeSystemsField();

  const observer = new IntersectionObserver(
    (entries) => {
      systemsInView = entries.some((entry) => entry.isIntersecting);
      syncSystemsLoop();
    },
    {
      threshold: 0.1,
    }
  );

  observer.observe(tracePanel);
}

function setCardState(projectId) {
  projectMeta.forEach((meta, id) => {
    const isActive = id === projectId;
    meta.card.classList.toggle("is-active", isActive);
    meta.button.setAttribute("aria-expanded", String(isActive));
  });
}

function renderDrawer(projectId) {
  const template = projectTemplates.get(projectId);
  const meta = projectMeta.get(projectId);
  if (!template || !drawerStage || !drawerTitle || !meta) {
    return false;
  }

  drawerStage.replaceChildren(template.content.cloneNode(true));
  drawerTitle.textContent = meta.title;
  return true;
}

function clearProjectHash(projectId) {
  if (window.location.hash.replace(/^#/, "") !== projectId) {
    return;
  }

  const url = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState(null, "", url);
}

function openProjectDrawer(projectId, options = {}) {
  const meta = projectMeta.get(projectId);
  if (!meta || !projectDrawer) {
    return;
  }

  if (closeDrawerTimer) {
    window.clearTimeout(closeDrawerTimer);
    closeDrawerTimer = 0;
  }

  if (!renderDrawer(projectId)) {
    return;
  }

  activeProject = projectId;
  setCardState(projectId);
  setCurrentHeroProject(projectId);

  projectDrawer.hidden = false;
  window.requestAnimationFrame(() => {
    projectDrawer.classList.add("is-open");
  });

  if (options.updateHash !== false) {
    window.history.replaceState(null, "", `#${projectId}`);
  }

  if (options.scrollToCard) {
    meta.card.scrollIntoView({
      behavior: prefersReducedMotion.matches ? "auto" : "smooth",
      block: "start",
    });
  }
}

function closeProjectDrawer(options = {}) {
  if (!projectDrawer || projectDrawer.hidden) {
    activeProject = null;
    setCardState(null);
    if (options.projectId) {
      clearProjectHash(options.projectId);
    }
    return;
  }

  projectDrawer.classList.remove("is-open");
  setCardState(null);

  const closingProject = activeProject;
  activeProject = null;

  if (options.clearHash && closingProject) {
    clearProjectHash(closingProject);
  }

  const finishClose = () => {
    projectDrawer.hidden = true;
    if (drawerStage) {
      drawerStage.replaceChildren();
    }
  };

  if (prefersReducedMotion.matches) {
    finishClose();
    return;
  }

  closeDrawerTimer = window.setTimeout(() => {
    closeDrawerTimer = 0;
    finishClose();
  }, 240);
}

function toggleProject(projectId, options = {}) {
  if (activeProject === projectId) {
    closeProjectDrawer({ clearHash: true });
    return;
  }

  openProjectDrawer(projectId, options);
}

function syncProjectFromHash() {
  const hash = window.location.hash.replace(/^#/, "");
  if (projectMeta.has(hash)) {
    openProjectDrawer(hash, { updateHash: false });
    return;
  }

  if (!activeProject) {
    setCurrentHeroProject("motorproof");
  }
}

revealItems.forEach((item, index) => {
  const parentGroup = item.closest("[data-reveal-group]");
  if (parentGroup) {
    const siblings = Array.from(parentGroup.querySelectorAll(".reveal"));
    item.style.transitionDelay = `${siblings.indexOf(item) * 80}ms`;
    return;
  }

  item.style.transitionDelay = `${(index % 4) * 70}ms`;
});

if (prefersReducedMotion.matches) {
  revealItems.forEach((item) => item.classList.add("is-visible"));
} else {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      });
    },
    {
      threshold: 0.14,
      rootMargin: "0px 0px -36px 0px",
    }
  );

  revealItems.forEach((item) => revealObserver.observe(item));
}

heroIndexLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    const projectId = link.dataset.projectLink;
    if (!projectId) {
      return;
    }

    event.preventDefault();
    toggleProject(projectId, { scrollToCard: true });
  });
});

projectButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const projectId = button.dataset.project;
    if (!projectId) {
      return;
    }

    toggleProject(projectId);
  });
});

if (drawerClose) {
  drawerClose.addEventListener("click", () => {
    closeProjectDrawer({ clearHash: true });
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && activeProject) {
    closeProjectDrawer({ clearHash: true });
  }
});

syncCursorMode();
setCurrentHeroProject("motorproof");
syncProjectFromHash();
setupSystemsField();
subscribeMedia(prefersReducedMotion, () => {
  syncCursorMode();
  syncSystemsLoop();
});
subscribeMedia(finePointer, syncCursorMode);
window.addEventListener("resize", () => {
  syncCursorMode();
  queueSystemsResize();
});
window.addEventListener("hashchange", syncProjectFromHash);
window.addEventListener("visibilitychange", syncSystemsLoop);
window.addEventListener("blur", () => {
  hideCursor();
});
window.addEventListener("mouseout", (event) => {
  if (event.relatedTarget) {
    return;
  }

  hideCursor();
});
