/**
 * Class recipes shared by .astro components and React islands, so a button in
 * the admin or a form island looks identical to one rendered by Button.astro.
 */
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "link" | "destructive";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const buttonBase =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary " +
  "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 " +
  "[&_svg]:size-4 [&_svg]:shrink-0";

const buttonVariantClasses: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  outline: "border border-border bg-background hover:bg-muted",
  ghost: "hover:bg-muted",
  link: "text-primary underline-offset-4 hover:underline",
  destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
};

const buttonSizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-12 px-7 text-base",
  icon: "size-10",
};

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(buttonBase, buttonVariantClasses[variant], variant !== "link" && buttonSizeClasses[size], className);
}

export type BadgeVariant = "default" | "secondary" | "outline" | "success" | "destructive";

const badgeVariantClasses: Record<BadgeVariant, string> = {
  default: "bg-primary/10 text-primary",
  secondary: "bg-secondary text-secondary-foreground",
  outline: "border border-border text-foreground",
  success: "bg-success/15 text-success",
  destructive: "bg-destructive/10 text-destructive",
};

export function badgeClasses(variant: BadgeVariant = "default", className?: string) {
  return cn(
    "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium",
    badgeVariantClasses[variant],
    className,
  );
}

export const inputClasses =
  "block w-full rounded-md border border-border bg-background px-3.5 py-2.5 text-base text-foreground " +
  "placeholder:text-muted-foreground/70 transition-colors " +
  "focus:border-primary focus:outline-2 focus:outline-offset-0 focus:outline-primary/30 " +
  "disabled:cursor-not-allowed disabled:opacity-60 " +
  "aria-invalid:border-destructive aria-invalid:focus:outline-destructive/30";
