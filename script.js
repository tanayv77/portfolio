const revealItems = Array.from(document.querySelectorAll(".reveal"));
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
const cursorDot = document.getElementById("cur");
const cursorRing = document.getElementById("cur-ring");
const tracePanel = document.querySelector("[data-trace-panel]");
const hoverTargets = Array.from(
  document.querySelectorAll("a, button, summary, .trace-label")
);

let cursorEnabled = false;
let pointerSeen = false;
let mouseX = 0;
let mouseY = 0;
let ringX = 0;
let ringY = 0;
let ringFrame = 0;

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

  tracePanel.style.setProperty("--mx", "72%");
  tracePanel.style.setProperty("--my", "48%");
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

  startRingLoop();
}

function handleHoverStart() {
  if (!cursorEnabled) {
    return;
  }

  document.body.classList.add("hov");
}

function handleHoverEnd() {
  document.body.classList.remove("hov");
}

function handleTraceMove(event) {
  if (!cursorEnabled || !tracePanel) {
    return;
  }

  const rect = tracePanel.getBoundingClientRect();
  const x = Math.max(0, Math.min(event.clientX - rect.left, rect.width));
  const y = Math.max(0, Math.min(event.clientY - rect.top, rect.height));
  tracePanel.style.setProperty("--mx", `${x}px`);
  tracePanel.style.setProperty("--my", `${y}px`);
}

function handleTraceEnter() {
  if (!cursorEnabled) {
    return;
  }

  document.body.classList.add("trace-hot");
}

function handleTraceLeave() {
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

  hoverTargets.forEach((target) => {
    target.addEventListener("mouseenter", handleHoverStart);
    target.addEventListener("mouseleave", handleHoverEnd);
  });

  if (tracePanel) {
    tracePanel.addEventListener("pointerenter", handleTraceEnter);
    tracePanel.addEventListener("pointerleave", handleTraceLeave);
    tracePanel.addEventListener("pointermove", handleTraceMove, { passive: true });
  }
}

function disableCursor() {
  if (!cursorEnabled) {
    return;
  }

  cursorEnabled = false;
  pointerSeen = false;
  document.body.classList.remove("cursor-enabled", "hov", "trace-hot");
  document.removeEventListener("pointermove", handlePointerMove);

  hoverTargets.forEach((target) => {
    target.removeEventListener("mouseenter", handleHoverStart);
    target.removeEventListener("mouseleave", handleHoverEnd);
  });

  if (tracePanel) {
    tracePanel.removeEventListener("pointerenter", handleTraceEnter);
    tracePanel.removeEventListener("pointerleave", handleTraceLeave);
    tracePanel.removeEventListener("pointermove", handleTraceMove);
    resetTracePanel();
  }

  stopRingLoop();

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

syncCursorMode();
subscribeMedia(prefersReducedMotion, syncCursorMode);
subscribeMedia(finePointer, syncCursorMode);
window.addEventListener("resize", syncCursorMode, { passive: true });
window.addEventListener("blur", () => {
  document.body.classList.remove("hov", "trace-hot");
});
window.addEventListener("mouseout", (event) => {
  if (event.relatedTarget) {
    return;
  }

  document.body.classList.remove("hov", "trace-hot");
});
