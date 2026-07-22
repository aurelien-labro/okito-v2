"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState<boolean | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const paint = () => {
      const forced = document.documentElement.getAttribute("data-theme");
      setIsDark(forced ? forced === "dark" : media.matches);
    };
    paint();
    media.addEventListener("change", paint);
    return () => media.removeEventListener("change", paint);
  }, []);

  function toggle() {
    const root = document.documentElement;
    const cur = root.getAttribute("data-theme");
    let next: "light" | "dark";
    if (cur === "dark") next = "light";
    else if (cur === "light") next = "dark";
    else next = window.matchMedia("(prefers-color-scheme: dark)").matches ? "light" : "dark";
    root.setAttribute("data-theme", next);
    setIsDark(next === "dark");
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label="Changer le thème"
      title="Changer le thème"
    >
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {isDark ? (
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        ) : (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        )}
      </svg>
    </button>
  );
}
