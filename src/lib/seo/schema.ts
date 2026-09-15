/**
 * schema.org JSON-LD builders. Render the result with `<JsonLd data={…} />`.
 *
 * Keep structured data truthful and matching visible page content — Google
 * ignores (or penalizes) markup describing things the user can't see.
 */
import { siteConfig, type Locale } from "@site-config";
import { absoluteUrl } from "@/lib/site";

type Thing = Record<string, unknown>;

const ORG_ID = () => absoluteUrl("/#organization");
const WEBSITE_ID = () => absoluteUrl("/#website");

function postalAddress() {
  const address = siteConfig.contact.address;
  if (!address) return undefined;
  return {
    "@type": "PostalAddress",
    streetAddress: address.street,
    addressLocality: address.city,
    postalCode: address.postalCode,
    addressRegion: address.region,
    addressCountry: address.country,
  };
}

/** Organization — or a LocalBusiness subtype when `siteConfig.organization.type` says so. */
export function organizationSchema(): Thing {
  const { organization, contact, socials, name } = siteConfig;
  const isLocalBusiness = organization.type !== "Organization";
  return {
    "@type": organization.type,
    "@id": ORG_ID(),
    name,
    legalName: organization.legalName,
    url: absoluteUrl("/"),
    logo: absoluteUrl(organization.logo),
    email: contact.email,
    telephone: contact.phone,
    foundingDate: organization.foundingYear ? String(organization.foundingYear) : undefined,
    address: postalAddress(),
    sameAs: Object.values(socials).filter(Boolean),
    ...(isLocalBusiness && {
      image: absoluteUrl(siteConfig.ogImage),
      openingHours: contact.openingHours,
    }),
  };
}

export function websiteSchema(lang: Locale): Thing {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID(),
    url: absoluteUrl("/"),
    name: siteConfig.name,
    description: siteConfig.description[lang],
    inLanguage: siteConfig.locales,
    publisher: { "@id": ORG_ID() },
  };
}

export interface BreadcrumbItem {
  name: string;
  /** Site-relative path; omit for the current page. */
  path?: string;
}

export function breadcrumbSchema(items: BreadcrumbItem[]): Thing {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.path ? absoluteUrl(item.path) : undefined,
    })),
  };
}

export interface FaqItem {
  question: string;
  /** Plain text or simple HTML. */
  answer: string;
}

export function faqSchema(items: FaqItem[]): Thing {
  return {
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

export interface ArticleInput {
  title: string;
  description: string;
  path: string;
  image?: string;
  publishedAt: Date;
  updatedAt?: Date;
  authorName?: string;
  lang: Locale;
}

export function articleSchema(input: ArticleInput): Thing {
  return {
    "@type": "BlogPosting",
    headline: input.title,
    description: input.description,
    url: absoluteUrl(input.path),
    mainEntityOfPage: absoluteUrl(input.path),
    image: input.image ? absoluteUrl(input.image) : absoluteUrl(siteConfig.ogImage),
    datePublished: input.publishedAt.toISOString(),
    dateModified: (input.updatedAt ?? input.publishedAt).toISOString(),
    inLanguage: input.lang,
    author: input.authorName ? { "@type": "Person", name: input.authorName } : { "@id": ORG_ID() },
    publisher: { "@id": ORG_ID() },
  };
}

export interface ProductInput {
  name: string;
  description: string;
  path: string;
  image?: string;
  price?: number;
  currency?: string;
  sku?: string;
  availability?: "InStock" | "OutOfStock" | "PreOrder";
}

export function productSchema(input: ProductInput): Thing {
  return {
    "@type": "Product",
    name: input.name,
    description: input.description,
    url: absoluteUrl(input.path),
    image: input.image ? absoluteUrl(input.image) : undefined,
    sku: input.sku,
    brand: { "@id": ORG_ID() },
    offers:
      input.price === undefined
        ? undefined
        : {
            "@type": "Offer",
            price: input.price.toFixed(2),
            priceCurrency: input.currency ?? "EUR",
            availability: `https://schema.org/${input.availability ?? "InStock"}`,
            url: absoluteUrl(input.path),
          },
  };
}

/** Wraps one or more nodes in a single `@graph` document. */
export function graph(...nodes: Thing[]): Thing {
  return { "@context": "https://schema.org", "@graph": nodes };
}
