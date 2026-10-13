import { Card, Skeleton } from "@heroui/react";
import Link from "next/link";
import type { AnimeSummary } from "@/lib/api/client";
import { formatStatus } from "@/lib/format";
import { AnimeImage } from "./anime-image";
import { ButtonLink } from "./button-link";
import { EmptyState } from "./empty-state";
import {
  MediaCard,
  MediaCardBody,
  MediaCardLabel,
  MediaCardMedia,
  MediaCardOverlay,
} from "./media-card";

type PosterGridEmptyState = {
  title: string;
  description?: string;
  action?: { href: string; label: string };
};

// Pages hold 20 items: 2, 4 or 5 columns always end with a full row. In the
// 80rem container a poster is 180–235px wide from lg up.
export const POSTER_GRID_CLASS =
  "grid w-full grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-5";
export const POSTER_GRID_SIZES =
  "(max-width: 639px) 50vw, (max-width: 1023px) 25vw, 240px";

const yearOf = (item: AnimeSummary) =>
  item.startDate ? String(new Date(item.startDate).getUTCFullYear()) : null;

export function PosterGrid({
  anime,
  variant = "catalog",
  emptyState,
}: {
  anime: AnimeSummary[];
  variant?: "catalog" | "home";
  emptyState?: PosterGridEmptyState;
}) {
  if (anime.length === 0) {
    const content = emptyState ?? {
      title: "Sin resultados",
      description: "Ninguna obra coincide con estos filtros.",
      action: { href: "/catalogo", label: "Limpiar filtros" },
    };
    return (
      <EmptyState
        title={content.title}
        description={content.description}
        action={
          content.action ? (
            <ButtonLink href={content.action.href} variant="secondary">
              {content.action.label}
            </ButtonLink>
          ) : null
        }
      />
    );
  }

  const catalog = variant === "catalog";
  return (
    <div className={POSTER_GRID_CLASS}>
      {anime.map((item, index) => {
        const category = item.category?.name ?? "Anime";
        const year = yearOf(item);
        const status =
          item.status === "UNKNOWN" ? null : formatStatus(item.status);
        const synopsis = item.synopsis?.trim();
        return (
          <MediaCard key={item.id}>
            <Link
              aria-label={[item.title, category, year]
                .filter(Boolean)
                .join(", ")}
              className="flex flex-1 flex-col outline-none"
              href={`/anime/${item.slug}`}
              prefetch={false}
            >
              <MediaCardMedia aspect="poster">
                {/* Catalog pages: the first two posters are the first row on
                    phones and the LCP candidates (preloaded, high priority).
                    The rest of a desktop first row (5 columns) loads eagerly
                    at low priority, so phones don't fetch it ahead of the LCP. */}
                <AnimeImage
                  src={item.posterUrl}
                  alt=""
                  priority={catalog && index < 2}
                  loading={catalog && index < 5 ? "eager" : "lazy"}
                  fetchPriority={
                    catalog && index >= 2 && index < 5 ? "low" : undefined
                  }
                  sizes={POSTER_GRID_SIZES}
                />
                {status || synopsis ? (
                  <MediaCardOverlay>
                    {status ? (
                      <span className="text-xs font-semibold text-link">
                        {status}
                      </span>
                    ) : null}
                    {synopsis ? (
                      <p className="mt-2 line-clamp-8 text-xs leading-5 text-subtle">
                        {synopsis}
                      </p>
                    ) : null}
                  </MediaCardOverlay>
                ) : null}
                <MediaCardLabel>{category}</MediaCardLabel>
              </MediaCardMedia>
              <MediaCardBody title={item.title} meta={year} />
            </Link>
          </MediaCard>
        );
      })}
    </div>
  );
}

// 20 placeholders: whole rows at 2, 4 and 5 columns, like the real page.
// `still` for episode cards, which share this grid.
export function PosterGridSkeleton({
  count = 20,
  aspect = "poster",
}: {
  count?: number;
  aspect?: "poster" | "still";
}) {
  return (
    <div aria-hidden="true" className={POSTER_GRID_CLASS}>
      {Array.from({ length: count }, (_, index) => (
        <MediaCard key={index}>
          <MediaCardMedia aspect={aspect}>
            <Skeleton className="absolute inset-0" />
          </MediaCardMedia>
          <Card.Content>
            <Skeleton className="mt-1 h-3.5 w-4/5" />
            <Skeleton className="mt-1.5 h-3 w-1/4" />
          </Card.Content>
        </MediaCard>
      ))}
    </div>
  );
}
