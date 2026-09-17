/**
 * Progressive enhancement for every cart form and the drawer. Loaded once per
 * page by CartButton (the header slot), so product and cart pages need no script
 * of their own for cart changes.
 *
 * Motion (ported from the Xristos store, without framer-motion): the product image
 * flies to the cart in an arc, the cart icon bounces, the badge pops, drawer lines
 * stagger in and removed lines slide out. All of it is skipped for reduced motion.
 */
import { actions } from "astro:actions";
import { trackEvent } from "@/lib/tracking";

const COUNT_COOKIE = "shopify_cart_count";
const SPRING = "cubic-bezier(0.16, 1, 0.3, 1)";

// Hidden tabs pause animations, so their `finished` promises would hold up the cart.
const reducedMotion = () => document.hidden || matchMedia("(prefers-reduced-motion: reduce)").matches;
const readCount = () => Number(document.cookie.match(new RegExp(`(?:^|; )${COUNT_COOKIE}=(\\d+)`))?.[1] ?? 0);

let lastCount: number | null = null;

function renderCount(count = readCount()) {
  const changed = lastCount !== null && count !== lastCount;
  lastCount = count;
  for (const badge of document.querySelectorAll<HTMLElement>("[data-cart-count]")) {
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.hidden = count === 0;
    if (changed && count > 0 && !reducedMotion()) {
      badge.animate({ scale: [0.5, 1], opacity: [0, 1] }, { duration: 350, easing: SPRING });
    }
  }
}

/** The visible cart icon (header on desktop and mobile). */
const cartIcon = () => [...document.querySelectorAll<HTMLElement>("[data-cart-toggle]")].find((el) => el.offsetParent !== null) ?? null;

function bounceCart() {
  cartIcon()?.animate(
    { scale: [1, 1.25, 0.92, 1.12, 1], rotate: ["0deg", "-4deg", "4deg", "0deg", "0deg"] },
    { duration: 450, easing: "ease-out" },
  );
}

/** The product image currently shown for this form (gallery slide), if any. */
function sourceImage(form: HTMLFormElement): HTMLImageElement | null {
  const track = form.closest("[data-product]")?.querySelector<HTMLElement>("[data-gallery-track]");
  if (!track) return null;
  const index = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
  return track.children[index]?.querySelector("img") ?? null;
}

/**
 * Arc from the product image to the cart icon. X and Y are animated on two nested
 * elements with different easings, which traces a curve instead of a straight line.
 */
function flyToCart(image: HTMLImageElement | null): Promise<void> {
  const target = cartIcon();
  if (!image || !target || reducedMotion()) return Promise.resolve();

  const from = image.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const size = 64;
  const startX = Math.min(Math.max(from.left + from.width / 2, size), innerWidth - size) - size / 2;
  const startY = Math.min(Math.max(from.top + from.height / 2, size), innerHeight - size) - size / 2;
  const endX = to.left + to.width / 2 - size / 2;
  const endY = to.top + to.height / 2 - size / 2;
  const peakY = Math.min(startY, endY) - 70;

  const outer = document.createElement("div");
  outer.setAttribute("aria-hidden", "true");
  Object.assign(outer.style, { position: "fixed", left: "0", top: "0", zIndex: "9999", pointerEvents: "none", translate: `${startX}px 0` });
  const inner = document.createElement("div");
  inner.className = "size-16 overflow-hidden rounded-lg border border-border bg-card p-1 shadow-xl";
  Object.assign(inner.style, { translate: `0 ${startY}px` });
  const clone = document.createElement("img");
  clone.src = image.currentSrc || image.src;
  clone.alt = "";
  clone.className = "size-full object-cover";
  inner.append(clone);
  outer.append(inner);
  document.body.append(outer);

  const duration = 780;
  const x = outer.animate({ translate: [`${startX}px 0`, `${endX}px 0`] }, { duration, easing: "cubic-bezier(0.4, 0, 0.6, 1)", fill: "forwards" });
  inner.animate(
    [
      { translate: `0 ${startY}px`, scale: 1, rotate: "0deg", opacity: 1, easing: "cubic-bezier(0.2, 0.7, 0.4, 1)" },
      { translate: `0 ${peakY}px`, scale: 1.2, rotate: "-12deg", opacity: 1, offset: 0.4, easing: "cubic-bezier(0.6, 0, 0.8, 0.4)" },
      { translate: `0 ${endY}px`, scale: 0.22, rotate: "18deg", opacity: 0.4 },
    ],
    { duration, fill: "forwards" },
  );
  return x.finished.then(
    () => outer.remove(),
    () => outer.remove(),
  );
}

async function loadPanel(target: HTMLElement, url: string) {
  target.setAttribute("aria-busy", "true");
  try {
    const response = await fetch(url, { headers: { Accept: "text/html" }, cache: "no-store" });
    target.innerHTML = await response.text();
  } finally {
    target.removeAttribute("aria-busy");
    renderCount();
  }
}

function drawer() {
  const element = document.querySelector<HTMLElement>("[data-cart-drawer]");
  const panel = element?.querySelector<HTMLElement>("[data-cart-panel]");
  return element && panel ? { element, panel, url: element.dataset.panelUrl! } : null;
}

function staggerLines(panel: HTMLElement) {
  panel.setAttribute("data-enter", "");
  setTimeout(() => panel.removeAttribute("data-enter"), 700);
}

async function openDrawer() {
  const cart = drawer();
  if (!cart) return false;
  if (cart.element.matches(":popover-open")) {
    await loadPanel(cart.panel, cart.url);
    return true;
  }
  // Opens at once: last known contents (or a loading note) slide in, fresh contents follow.
  const hadContent = cart.panel.querySelector("[data-cart-lines]") !== null;
  if (!hadContent) cart.panel.textContent = cart.element.dataset.loading ?? "";
  else staggerLines(cart.panel);
  cart.element.showPopover();
  await loadPanel(cart.panel, cart.url);
  if (!hadContent) staggerLines(cart.panel);
  return true;
}

/** Re-renders whichever cart view contains the form (drawer or cart page). */
async function refreshAround(form: HTMLFormElement) {
  const page = form.closest<HTMLElement>("[data-cart-page]");
  if (page) return loadPanel(page, page.dataset.panelUrl!);
  const cart = drawer();
  if (cart && cart.element.contains(form)) return loadPanel(cart.panel, cart.url);
}

function showError(form: HTMLFormElement, message: string) {
  const root = form.closest("[data-cart-root], [data-cart-lines]") ?? form.parentElement;
  const target = root?.querySelector<HTMLElement>("[data-cart-message]");
  if (target) target.textContent = message;
}

/** A line leaving the cart slides out before the view refreshes. */
function exitLine(form: HTMLFormElement, data: FormData): Promise<unknown> {
  const removing = data.get("intent") === "remove" || (data.get("intent") === "update" && Number(data.get("quantity")) <= 0);
  const line = removing ? form.closest<HTMLElement>("[data-cart-line]") : null;
  if (!line || reducedMotion()) return Promise.resolve();
  return line.animate({ opacity: [1, 0], translate: ["0 0", "20px 0"] }, { duration: 250, easing: "ease-in", fill: "forwards" }).finished.catch(() => {});
}

async function submit(form: HTMLFormElement, submitter: HTMLElement | null) {
  const data = new FormData(form, submitter);
  const isAdd = form.dataset.cartForm === "add";
  const buttons = [...form.querySelectorAll<HTMLButtonElement>("button")];
  buttons.forEach((button) => (button.disabled = true));
  form.setAttribute("aria-busy", "true");
  showError(form, "");

  // Motion starts with the click; the request runs alongside it.
  const motion = isAdd ? flyToCart(sourceImage(form)) : exitLine(form, data);
  const request = actions.shopify.cart(data).catch(() => ({ data: undefined, error: new Error('{"code":"shopify"}') }));
  const [{ data: result, error }] = await Promise.all([request, motion]);

  form.removeAttribute("aria-busy");
  buttons.forEach((button) => (button.disabled = false));
  if (isAdd && !error) bounceCart();
  renderCount(result?.totalQuantity);

  if (error) {
    let code = "shopify";
    try {
      code = (JSON.parse(error.message) as { code?: string }).code ?? code;
    } catch {
      // Not one of ours (network, server error): generic message.
    }
    const messages = JSON.parse(document.querySelector<HTMLElement>("[data-cart-errors]")?.dataset.cartErrors ?? "{}") as Record<string, string>;
    // A partial failure (e.g. quantity capped at stock) still changed the cart.
    await refreshAround(form);
    showError(form, messages[code] ?? messages.shopify ?? code);
    return;
  }

  if (isAdd) {
    const quantity = Number(data.get("quantity") ?? 1);
    const value = Number(form.dataset.price ?? 0) * quantity;
    trackEvent("add_to_cart", { currency: form.dataset.currency, value, item_id: form.dataset.productId, item_name: form.dataset.productTitle, quantity });
    // A beat after the bounce, as in the original.
    await new Promise((resolve) => setTimeout(resolve, reducedMotion() ? 0 : 150));
    await openDrawer();
    return;
  }
  await refreshAround(form);
}

export function initCart() {
  renderCount();

  document.addEventListener("click", (event) => {
    const toggle = (event.target as Element).closest("[data-cart-toggle]");
    // Modified clicks keep their normal meaning (open the cart page in a new tab).
    if (!toggle || (event as MouseEvent).metaKey || (event as MouseEvent).ctrlKey || (event as MouseEvent).shiftKey) return;
    if (drawer()) {
      event.preventDefault();
      void openDrawer();
    }
  });

  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches("[data-cart-form]")) return;
    event.preventDefault();
    if (form.getAttribute("aria-busy") === "true") return;
    void submit(form, event.submitter);
  });

  // Back/forward cache restores stale badges.
  window.addEventListener("pageshow", () => renderCount());
}
