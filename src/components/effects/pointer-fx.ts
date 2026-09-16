/**
 * The only JavaScript in the effects folder (~0.4 KB gzipped).
 *
 * Publishes the pointer position inside `[data-tilt]` / `[data-spotlight]` elements
 * as `--pointer-x` / `--pointer-y` (0–1). The CSS in styles/effects.css does the
 * rest, so this file never reads layout during a pointer event and never animates
 * anything itself.
 *
 * It opts out entirely on touch devices and for reduced-motion users — there the
 * components keep their plain hover styling.
 */
const SELECTOR = "[data-tilt],[data-spotlight]";

if (window.matchMedia("(hover: hover)").matches && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  let frame = 0;
  let pending: { element: HTMLElement; x: number; y: number } | null = null;

  const flush = () => {
    frame = 0;
    if (!pending) return;
    const { element, x, y } = pending;
    pending = null;
    element.style.setProperty("--pointer-x", x.toFixed(3));
    element.style.setProperty("--pointer-y", y.toFixed(3));
    // Marks "the pointer has been here", so the tilt transform only applies once
    // we have real coordinates (avoids a jump from the default 0.5/0.5 centre).
    element.dataset.pointer = "";
  };

  // One listener for the whole page, whatever the number of cards.
  document.addEventListener(
    "pointermove",
    (event) => {
      const element = (event.target as Element | null)?.closest<HTMLElement>(SELECTOR);
      if (!element) return;
      const rect = element.getBoundingClientRect();
      pending = {
        element,
        x: (event.clientX - rect.left) / rect.width,
        y: (event.clientY - rect.top) / rect.height,
      };
      frame ||= requestAnimationFrame(flush);
    },
    { passive: true },
  );

  // Reset on leave so the card settles back to flat.
  document.addEventListener(
    "pointerleave",
    (event) => {
      const element = (event.target as Element | null)?.closest<HTMLElement>(SELECTOR);
      if (!element) return;
      delete element.dataset.pointer;
      element.style.removeProperty("--pointer-x");
      element.style.removeProperty("--pointer-y");
    },
    { capture: true, passive: true },
  );
}
