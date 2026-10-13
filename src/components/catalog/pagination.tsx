"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { Pagination as PageNav } from "../pagination";
import { useCatalogNavigation } from "./catalog-navigation";

/** Catalog and search pages: crawlable links that, with JavaScript, page
 *  inside the catalog transition (results dim, the target page spins and
 *  focus moves to the new results). */
export function Pagination({
  page,
  totalPages,
  query,
}: {
  page: number;
  totalPages: number;
  /** Canonical query of the current results (serializable from the server). */
  query: string;
}) {
  const pathname = usePathname();
  const navigation = useCatalogNavigation();
  const [pending, setPending] = useState<{ from: number; to: number } | null>(
    null,
  );

  const href = (target: number) => {
    const next = new URLSearchParams(query);
    if (target > 1) next.set("page", String(target));
    else next.delete("page");
    return `${pathname}${next.size ? `?${next}` : ""}`;
  };

  return (
    <PageNav
      className="mt-12 justify-center"
      page={page}
      totalPages={totalPages}
      href={href}
      pendingPage={
        navigation?.isPending && pending?.from === page ? pending.to : undefined
      }
      onChange={
        navigation
          ? (target) => {
              if (navigation.isPending) return;
              setPending({ from: page, to: target });
              navigation.navigate(href(target), {
                scroll: true,
                focusResults: true,
              });
            }
          : undefined
      }
    />
  );
}
