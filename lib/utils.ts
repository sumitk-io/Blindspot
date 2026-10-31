import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function truncateDomain(input: string, max = 38) {
  const clean = input.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
