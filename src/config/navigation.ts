/**
 * Site navigation. Paths are locale-less ("/about"); components localize them.
 * Labels are translation keys so every locale gets its own text.
 */
import type { TranslationKey } from "@/i18n";

export interface NavLink {
  label: TranslationKey;
  path: string;
  /** Rendered as a dropdown on desktop and a nested list on mobile. */
  children?: NavLink[];
}

export interface FooterColumn {
  title: TranslationKey;
  links: NavLink[];
}

export const mainNav: NavLink[] = [
  { label: "nav.home", path: "/" },
  { label: "nav.about", path: "/about" },
  {
    label: "nav.services",
    path: "/services",
    children: [
      { label: "nav.servicesConsulting", path: "/services#consulting" },
      { label: "nav.servicesDevelopment", path: "/services#development" },
    ],
  },
  { label: "nav.contact", path: "/contact" },
];

/** Primary call-to-action shown at the end of the navbar. */
export const navCta: NavLink = { label: "nav.cta", path: "/contact" };

export const footerColumns: FooterColumn[] = [
  {
    title: "footer.company",
    links: [
      { label: "nav.about", path: "/about" },
      { label: "nav.contact", path: "/contact" },
    ],
  },
  {
    title: "footer.legal",
    links: [
      { label: "footer.privacy", path: "/privacy" },
      { label: "footer.terms", path: "/terms" },
    ],
  },
];
