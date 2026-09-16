/**
 * URL slugs. Greek is transliterated to Latin ("Νέα υπηρεσία" → "nea-ypiresia"):
 * readable when shared and never percent-encoded. Editors can override it.
 */
const GREEK: Record<string, string> = {
  α: "a", β: "v", γ: "g", δ: "d", ε: "e", ζ: "z", η: "i", θ: "th", ι: "i", κ: "k", λ: "l", μ: "m", ν: "n", ξ: "x",
  ο: "o", π: "p", ρ: "r", σ: "s", ς: "s", τ: "t", υ: "y", φ: "f", χ: "ch", ψ: "ps", ω: "o",
};
const DIGRAPHS: [RegExp, string][] = [
  [/ου/g, "ou"],
  [/αι/g, "ai"],
  [/ει/g, "ei"],
  [/οι/g, "oi"],
  [/μπ/g, "b"],
  [/ντ/g, "nt"],
  [/γκ/g, "gk"],
  [/γγ/g, "ng"],
];

export function slugify(input: string, maxLength = 80): string {
  let value = input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // strip accents (ά → α, é → e)
  for (const [pattern, replacement] of DIGRAPHS) value = value.replace(pattern, replacement);
  value = [...value].map((char) => GREEK[char] ?? char).join("");
  return value
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
}

export const isValidSlug = (slug: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 80;
