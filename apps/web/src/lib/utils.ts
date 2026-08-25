import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const COMBINING_DIACRITICS = new RegExp("[̀-ͯ]", "g");

/** Lowercase, diacritic-free, hyphen-separated — safe as a URL path segment. */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
