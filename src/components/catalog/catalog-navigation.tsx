"use client";

import { createContext, use } from "react";

export type CatalogNavigation = {
  /** Navigates inside the shared transition, so results dim while loading. */
  navigate: (href: string, options?: { scroll?: boolean }) => void;
  isPending: boolean;
};

export const CatalogNavigationContext = createContext<CatalogNavigation | null>(
  null,
);

export function useCatalogNavigation() {
  return use(CatalogNavigationContext);
}
