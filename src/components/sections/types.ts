import type { ImageMetadata } from "astro";
import type { ButtonVariant } from "@/components/ui/variants";
import type { IconName } from "@/components/ui/icons";

/** A call-to-action link. `href` must already be localized (localizePath). */
export interface CtaLink {
  label: string;
  href: string;
  variant?: ButtonVariant;
  external?: boolean;
}

export type ImageSource = ImageMetadata | string;

export interface ImageProps {
  src: ImageSource;
  alt: string;
}

export interface FeatureItem {
  title: string;
  description: string;
  icon?: IconName;
  href?: string;
}
