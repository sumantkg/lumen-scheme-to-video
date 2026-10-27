"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Global, document-level scroll effects:
 *  - `.reveal` elements fade/slide in as they enter the viewport
 *  - `.stat-num` elements count up when scrolled into view
 *
 * Runs once per route. It MUST re-run on client-side navigation: the root
 * layout is not remounted when the page content changes, so a one-shot effect
 * would leave every newly mounted `.reveal` node stuck at `opacity: 0`.
 */
export default function ScrollEffects() {
  const pathname = usePathname();

  useEffect(() => {
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const revealEls = Array.from(
      document.querySelectorAll<HTMLElement>(".reveal")
    );
    const counters = Array.from(
      document.querySelectorAll<HTMLElement>(".stat-num")
    );

    const revealAll = () =>
      revealEls.forEach((el) => el.classList.add("is-visible"));
    const settleCounters = () =>
      counters.forEach(
        (el) => (el.textContent = (el.dataset.count ?? "") + (el.dataset.suffix ?? ""))
      );

    if (reduce || !("IntersectionObserver" in window)) {
      revealAll();
      settleCounters();
      return;
    }

    // Freshly mounted nodes start hidden so they animate in.
    revealEls.forEach((el) => el.classList.remove("is-visible"));

    const runCounter = (el: HTMLElement) => {
      const target = Number(el.dataset.count || 0);
      const suffix = el.dataset.suffix || "";
      const duration = 1600;
      const start = performance.now();

      const tick = (now: number) => {
        const p = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const siblings = Array.from(
            entry.target.parentElement?.children || []
          );
          const delay = Math.min(siblings.indexOf(entry.target), 6) * 70;
          (entry.target as HTMLElement).style.transitionDelay = `${delay}ms`;
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -60px 0px" }
    );
    revealEls.forEach((el) => io.observe(el));

    const co = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            runCounter(entry.target as HTMLElement);
            co.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 }
    );
    counters.forEach((el) => co.observe(el));

    // Safety nets so content can never be left invisible.
    // 1. Shortly after mount, reveal anything at or above the viewport.
    const safety = window.setTimeout(() => {
      const vh = window.innerHeight;
      revealEls.forEach((el) => {
        if (el.getBoundingClientRect().top < vh) el.classList.add("is-visible");
      });
    }, 1200);

    // 2. Continuously: if the user jumps past content (anchor link, restored
    //    scroll position), reveal anything now above the viewport.
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        revealEls.forEach((el) => {
          if (el.getBoundingClientRect().top < 0) el.classList.add("is-visible");
        });
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    return () => {
      io.disconnect();
      co.disconnect();
      window.clearTimeout(safety);
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [pathname]);

  return null;
}
