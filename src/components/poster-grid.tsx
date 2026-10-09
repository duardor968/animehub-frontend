import { Card } from "@heroui/react";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { AnimeSummary } from "@/lib/api/client";
import { formatStatus } from "@/lib/format";
import { AnimeImage } from "./anime-image";
import { MediaCard } from "./media-card";

export type PosterGridEmptyState = {
  title: string;
  description: string;
  action?: {
    href: string;
    label: string;
  };
};

// Fills the page container: posters stay around their 225–260px source width.
export const POSTER_GRID_CLASS =
  "grid w-full grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6";
// The home feed has 20 items: with 3 or 6 columns show 18 so no row is left
// with orphans. (Paginated catalog results are never trimmed.)
const HOME_TRIM_CLASS =
  "sm:max-lg:[&>:nth-child(n+19)]:hidden 2xl:[&>:nth-child(n+19)]:hidden";

const cardClass =
  "touch-card group min-w-0 gap-0 rounded-xl bg-surface p-0 transition-shadow duration-300 hover:shadow-[0_18px_42px_rgba(0,0,0,.3)] has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-focus has-[a:focus-visible]:ring-offset-2 has-[a:focus-visible]:ring-offset-background";

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
    const content =
      emptyState ??
      (variant === "home"
        ? {
            title: "Aún no hay novedades",
            description:
              "No encontramos anime reciente para mostrar en este momento.",
            action: { href: "/catalogo", label: "Explorar el catálogo" },
          }
        : {
            title: "No encontramos resultados",
            description:
              "Prueba con otros filtros o explora el catálogo completo.",
            action: { href: "/catalogo", label: "Limpiar filtros" },
          });

    return (
      <section
        aria-label={content.title}
        className="grid min-h-80 place-items-center border-y border-white/8 py-14 text-center"
      >
        <div className="max-w-md">
          <span
            aria-hidden="true"
            className="mx-auto block h-px w-10 bg-brand"
          />
          <h2 className="mt-5 font-display text-2xl font-semibold tracking-tight text-foreground">
            {content.title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            {content.description}
          </p>
          {content.action ? (
            <Link
              className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-accent-soft px-5 text-sm font-semibold text-accent-soft-foreground transition-colors hover:bg-accent-soft-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              href={content.action.href}
            >
              {content.action.label}
              <ArrowRight aria-hidden="true" size={15} />
            </Link>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <div
      className={`${POSTER_GRID_CLASS} ${variant === "home" ? HOME_TRIM_CLASS : ""}`}
    >
      {anime.map((item, index) => {
        const category = item.category?.name ?? "Anime";
        const year = yearOf(item);
        const status =
          item.status === "UNKNOWN" ? null : formatStatus(item.status);
        const facts = [year, status].filter(Boolean).join(" · ");
        return (
          <MediaCard className={cardClass} key={item.id}>
            <Link
              aria-label={[item.title, category, year]
                .filter(Boolean)
                .join(", ")}
              className="block outline-none"
              href={`/anime/${item.slug}`}
            >
              <div className="touch-static-media relative aspect-[2/3] overflow-hidden bg-surface [&_.anime-image_img]:transition-transform [&_.anime-image_img]:duration-700 [&_.anime-image_img]:ease-[cubic-bezier(.22,1,.36,1)] group-hover:[&_.anime-image_img]:scale-[1.04] group-has-[a:focus-visible]:[&_.anime-image_img]:scale-[1.04]">
                {/* Catalog pages: the first two posters are the first row on
                    phones and the LCP candidates (preloaded, high priority).
                    The rest of a desktop first row loads eagerly at low
                    priority: no preload, so phones (where they're below the
                    fold) don't fetch them ahead of the LCP. */}
                <AnimeImage
                  src={item.posterUrl}
                  alt=""
                  priority={variant !== "home" && index < 2}
                  loading={variant !== "home" && index < 6 ? "eager" : "lazy"}
                  fetchPriority={
                    variant !== "home" && index >= 2 && index < 6
                      ? "low"
                      : undefined
                  }
                  sizes="(max-width: 639px) 50vw, (max-width: 1279px) 25vw, 16vw"
                />
                <span className="touch-category-label absolute bottom-0 left-0 rounded-tr-lg bg-surface px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.08em] text-link transition-opacity duration-300 group-hover:opacity-0 group-has-[a:focus-visible]:opacity-0">
                  {category}
                </span>
                {/* The title is right below the poster: the panel adds what
                    the card doesn't show (synopsis, status). */}
                <div
                  aria-hidden="true"
                  className="touch-hover-panel absolute inset-0 flex flex-col justify-end bg-background-secondary/92 p-4 opacity-0 transition-opacity duration-250 group-hover:opacity-100 group-has-[a:focus-visible]:opacity-100"
                >
                  <span className="text-[10px] font-bold uppercase tracking-[.14em] text-link">
                    {category}
                  </span>
                  {facts ? (
                    <span className="mt-1 text-xs font-medium text-subtle">
                      {facts}
                    </span>
                  ) : null}
                  <p className="mt-2.5 line-clamp-8 text-xs leading-5 text-subtle">
                    {item.synopsis?.trim() ||
                      "Consulta la ficha para ver la sinopsis y todos los detalles."}
                  </p>
                </div>
              </div>
              <Card.Content className="gap-1 px-3.5 py-3.5">
                <Card.Title className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">
                  {item.title}
                </Card.Title>
                <Card.Description className="text-xs leading-5 text-muted">
                  {year ?? "Sin fecha"}
                </Card.Description>
              </Card.Content>
            </Link>
          </MediaCard>
        );
      })}
    </div>
  );
}

// 12 placeholders fill whole rows at 2, 3, 4 and 6 columns; the 5-column
// layout shows 10.
const SKELETON_TRIM_CLASS = "xl:max-2xl:[&>:nth-child(n+11)]:hidden";

export function PosterGridSkeleton({
  count = 12,
  variant = "catalog",
}: {
  count?: number;
  variant?: "catalog" | "home";
}) {
  return (
    <div
      aria-hidden="true"
      className={`${POSTER_GRID_CLASS} ${SKELETON_TRIM_CLASS} ${variant === "home" ? HOME_TRIM_CLASS : ""}`}
    >
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="min-w-0 overflow-hidden rounded-xl bg-surface"
        >
          <div className="relative aspect-[2/3]">
            <span className="image-skeleton" />
          </div>
          <div className="flex flex-col gap-2 px-3.5 py-3.5">
            <span className="h-3.5 w-4/5 rounded bg-surface-tertiary" />
            <span className="h-3 w-1/4 rounded bg-surface-tertiary/70" />
          </div>
        </div>
      ))}
    </div>
  );
}
