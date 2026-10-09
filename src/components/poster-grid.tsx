import { Card } from "@heroui/react";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { AnimeSummary } from "@/lib/api/client";
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
            className="mx-auto block h-px w-10 bg-accent"
          />
          <h2 className="mt-5 font-(family-name:--font-display) text-2xl font-semibold tracking-tight text-foreground">
            {content.title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            {content.description}
          </p>
          {content.action ? (
            <Link
              className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent-soft px-4 text-sm font-semibold text-accent-soft-foreground transition-colors hover:bg-accent-soft-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
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
    <div className="mx-auto grid w-full max-w-[1152px] grid-cols-5 gap-x-4 gap-y-7 px-2 max-xl:grid-cols-4 max-lg:grid-cols-3 max-sm:grid-cols-2">
      {anime.map((item, index) => (
        <MediaCard
          className="touch-card group min-w-0 gap-0 rounded-xl bg-surface p-0 transition-shadow duration-300 hover:shadow-[0_18px_42px_rgba(0,0,0,.3)]"
          key={item.id}
        >
          <Link
            aria-label={`Ver ${item.title}`}
            className="block outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset"
            href={`/anime/${item.slug}`}
          >
            <div className="touch-static-media relative aspect-[2/3] overflow-hidden bg-surface [&_.anime-image_img]:transition-transform [&_.anime-image_img]:duration-700 [&_.anime-image_img]:ease-[cubic-bezier(.22,1,.36,1)] group-hover:[&_.anime-image_img]:scale-[1.04] group-has-[:focus-visible]:[&_.anime-image_img]:scale-[1.04]">
              <AnimeImage
                src={item.posterUrl}
                alt=""
                priority={variant !== "home" && index < 5}
              />
              <span className="touch-category-label absolute bottom-0 left-0 rounded-tr-lg bg-surface px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.08em] text-link transition-opacity duration-300 group-hover:opacity-0 group-has-[:focus-visible]:opacity-0">
                {item.category?.name ?? "Anime"}
              </span>
              <div
                aria-hidden="true"
                className="touch-hover-panel absolute inset-0 flex flex-col justify-end bg-background-secondary/92 p-4 opacity-0 transition-opacity duration-250 group-hover:opacity-100 group-has-[:focus-visible]:opacity-100"
              >
                <span className="text-[10px] font-bold uppercase tracking-[.14em] text-link">
                  {item.category?.name ?? "Anime"}
                </span>
                <strong className="mt-2 line-clamp-3 text-sm font-semibold leading-5 text-foreground">
                  {item.title}
                </strong>
                <p className="mt-2 line-clamp-5 text-xs leading-5 text-subtle">
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
                {item.startDate
                  ? new Date(item.startDate).getUTCFullYear()
                  : "Sin fecha"}
              </Card.Description>
            </Card.Content>
          </Link>
        </MediaCard>
      ))}
    </div>
  );
}
