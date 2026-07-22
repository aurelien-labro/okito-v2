"use client";

import { useEffect } from "react";

/**
 * Anime l'apparition des éléments [data-reveal] / [data-reveal-stagger] :
 * ajoute .revealed quand ils entrent dans le viewport.
 *
 * Double mécanisme : IntersectionObserver quand il est disponible, plus un
 * check par position (scroll/resize + intervalle court) en secours — certains
 * environnements embarqués (iframes de préview) n'émettent jamais les
 * callbacks d'IO, et le contenu ne doit JAMAIS rester invisible.
 */
export function RevealObserver() {
  useEffect(() => {
    const pending = new Set<Element>(
      document.querySelectorAll("[data-reveal], [data-reveal-stagger]"),
    );
    if (pending.size === 0) return;

    const reveal = (el: Element) => {
      el.classList.add("revealed");
      pending.delete(el);
    };

    const checkPositions = () => {
      const limit = window.innerHeight * 0.92;
      for (const el of pending) {
        if (el.getBoundingClientRect().top < limit) reveal(el);
      }
    };

    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              reveal(entry.target);
              io?.unobserve(entry.target);
            }
          }
        },
        { threshold: 0.12 },
      );
      for (const el of pending) io.observe(el);
    }

    checkPositions();
    window.addEventListener("scroll", checkPositions, { passive: true });
    window.addEventListener("resize", checkPositions, { passive: true });
    // Filet de sécurité : re-check périodique tant qu'il reste des éléments
    // cachés (couvre les environnements sans events scroll fiables).
    const interval = setInterval(() => {
      checkPositions();
      if (pending.size === 0) clearInterval(interval);
    }, 600);

    return () => {
      io?.disconnect();
      window.removeEventListener("scroll", checkPositions);
      window.removeEventListener("resize", checkPositions);
      clearInterval(interval);
    };
  }, []);
  return null;
}
