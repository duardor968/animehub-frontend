"use client";

import { usePathname } from "next/navigation";
import { ButtonLink } from "@/components/button-link";

/** "Buscar anime" with the words of the address that led nowhere
 *  (/anime/one-piece-film → «one piece film»). The not-found page gets no
 *  params, the path has them. */
export function SearchForSlug() {
  const slug = usePathname().split("/").filter(Boolean).at(-1) ?? "";
  let words = slug;
  try {
    words = decodeURIComponent(slug);
  } catch {
    // A malformed escape: search the raw text.
  }
  const query = words.replace(/[-_]+/g, " ").trim().slice(0, 100);
  return (
    <ButtonLink
      href={query ? `/buscar?q=${encodeURIComponent(query)}` : "/buscar"}
      prefetch={false}
    >
      Buscar anime
    </ButtonLink>
  );
}
