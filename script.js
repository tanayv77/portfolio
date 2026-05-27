const revealItems = Array.from(document.querySelectorAll(".reveal"));
const navLinks = Array.from(document.querySelectorAll("[data-nav]"));
const sections = Array.from(document.querySelectorAll("main section[id]"));
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function setActiveNav(id) {
  navLinks.forEach((link) => {
    const isActive = link.getAttribute("href") === `#${id}`;
    link.classList.toggle("is-active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "true");
    } else {
      link.removeAttribute("aria-current");
    }
  });
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

if (sections.length && navLinks.length) {
  const sectionObserver = new IntersectionObserver(
    (entries) => {
      const visibleSections = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

      if (visibleSections.length) {
        setActiveNav(visibleSections[0].target.id);
      }
    },
    {
      rootMargin: "-30% 0px -55% 0px",
      threshold: [0.2, 0.45, 0.7],
    }
  );

  sections.forEach((section) => sectionObserver.observe(section));
}
