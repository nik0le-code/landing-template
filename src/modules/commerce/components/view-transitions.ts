/**
 * Names elements for the cross-document view transition right before the old page
 * is captured (pageswap) and right after the new one is ready (pagereveal), so a
 * name is only ever on the two elements that should morph into each other.
 *
 *   listing → product: clicked card image ⇄ gallery image
 *   product → listing: gallery image ⇄ that product's card
 *   listing → listing (sort, filters, pages): every card keeps its identity
 */
type ViewTransitionLike = { finished: Promise<unknown> };
type SwapEvent = Event & { viewTransition: ViewTransitionLike | null; activation?: { entry?: { url: string } } | null };
type RevealEvent = Event & { viewTransition: ViewTransitionLike | null };
type NavigationLike = { activation?: { from?: { url: string } | null } | null };

const HERO = "shop-product-image";

const pathOf = (url: string | undefined) => (url ? new URL(url).pathname : null);

function name(elements: (HTMLElement | null | undefined)[], transition: ViewTransitionLike, value: (el: HTMLElement) => string) {
  const named = elements.filter((el): el is HTMLElement => Boolean(el));
  for (const el of named) {
    el.style.viewTransitionName = value(el);
    if (el.dataset.productCard) el.style.setProperty("view-transition-class", "shop-card");
  }
  transition.finished.finally(() => named.forEach((el) => (el.style.viewTransitionName = "")));
}

/** Card image for a product path, when this page shows one. */
const cardImage = (path: string) => document.querySelector<HTMLElement>(`[data-product-card="${CSS.escape(path)}"] img`);
const cards = () => [...document.querySelectorAll<HTMLElement>("[data-product-card]")];
const heroImage = () => {
  const track = document.querySelector<HTMLElement>("[data-product] [data-gallery-track]");
  if (!track) return null;
  // Before the gallery script runs (pagereveal) the strip hasn't scrolled to the variant's image yet.
  const index = track.scrollLeft > 0 ? Math.round(track.scrollLeft / Math.max(1, track.clientWidth)) : Number(track.closest<HTMLElement>("[data-gallery]")?.dataset.initialIndex ?? 0);
  return track.children[index]?.querySelector<HTMLElement>("img") ?? null;
};
const isListing = () => Boolean(document.querySelector("[data-product-listing]"));

/**
 * Leaving a page, a card that links to the destination wins over the gallery (a
 * recommendation on a product page); arriving, the gallery wins over any card.
 */
function assign(otherPath: string | null, transition: ViewTransitionLike, otherIsListing: boolean, direction: "swap" | "reveal") {
  if (!otherPath) return;
  const card = cardImage(otherPath);
  const hero = heroImage();
  const target = direction === "swap" ? (card ?? hero) : (hero ?? card);
  if (target) return name([target], transition, () => HERO);
  if (isListing() && otherIsListing) name(cards(), transition, (el) => `shop-card-${el.dataset.productKey}`);
}

export function initViewTransitions(shopBase: string) {
  const listingPath = (path: string | null) => Boolean(path && (path === shopBase || path.startsWith(`${shopBase}/collections/`)));

  addEventListener("pageswap", (event) => {
    const { viewTransition, activation } = event as SwapEvent;
    if (!viewTransition) return;
    const to = pathOf(activation?.entry?.url);
    assign(to, viewTransition, listingPath(to), "swap");
  });

  addEventListener("pagereveal", (event) => {
    const { viewTransition } = event as RevealEvent;
    if (!viewTransition) return;
    const from = pathOf((window as unknown as { navigation?: NavigationLike }).navigation?.activation?.from?.url);
    assign(from, viewTransition, listingPath(from), "reveal");
  });
}
