"use client";

import { createContext, use } from "react";

export type CatalogNavigation = {
  /**
   * Navigates inside the shared transition, so results dim while loading.
   * `focusResults` moves keyboard focus to the new results once they show
   * (paging); otherwise focus stays put, or returns to "Filtros" if the
   * focused control went away.
   */
  navigate: (
    href: string,
    options?: { scroll?: boolean; focusResults?: boolean },
  ) => void;
  isPending: boolean;
};

export const CatalogNavigationContext = createContext<CatalogNavigation | null>(
  null,
);

export function useCatalogNavigation() {
  return use(CatalogNavigationContext);
}
