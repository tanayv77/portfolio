const revealItems = Array.from(document.querySelectorAll(".reveal"));
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

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
