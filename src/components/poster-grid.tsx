import { Card } from "@heroui/react";
import Link from "next/link";
import type { AnimeSummary } from "@/lib/api/client";
import { AnimeImage } from "./anime-image";

export function PosterGrid({
  anime,
  variant = "catalog",
}: {
  anime: AnimeSummary[];
  variant?: "catalog" | "home";
}) {
  return (
    <div
      className={
        variant === "home"
          ? "grid grid-cols-5 gap-x-4 gap-y-7 max-lg:grid-cols-4 max-md:grid-cols-3 max-sm:grid-cols-2"
          : "grid grid-cols-4 gap-x-4 gap-y-7 max-xl:grid-cols-3 max-md:grid-cols-2"
      }
    >
      {anime.map((item) => (
        <Card
          className="touch-card group min-w-0 gap-0 overflow-hidden rounded-xl bg-[#0A1424] p-0 transition-shadow duration-300 hover:shadow-[0_18px_42px_rgba(0,0,0,.3)]"
          key={item.id}
        >
          <Link
            className="block outline-none focus-visible:ring-2 focus-visible:ring-[#5B9CFF] focus-visible:ring-inset"
            href={`/anime/${item.slug}`}
          >
            <div className="touch-static-media relative aspect-[2/3] overflow-hidden bg-[#0A1220] [&_.anime-image_img]:transition-transform [&_.anime-image_img]:duration-700 [&_.anime-image_img]:ease-[cubic-bezier(.22,1,.36,1)] group-hover:[&_.anime-image_img]:scale-[1.04] group-has-[:focus-visible]:[&_.anime-image_img]:scale-[1.04]">
              <AnimeImage src={item.posterUrl} alt={item.title} />
              <span className="touch-category-label absolute bottom-0 left-0 rounded-tr-lg bg-[#0A1424] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.08em] text-[#8AB8FA] transition-opacity duration-300 group-hover:opacity-0 group-has-[:focus-visible]:opacity-0">
                {item.category?.name ?? "Anime"}
              </span>
              <div className="touch-hover-panel absolute inset-0 flex flex-col justify-end bg-[#07101D]/92 p-4 opacity-0 transition-opacity duration-250 group-hover:opacity-100 group-has-[:focus-visible]:opacity-100">
                <span className="text-[10px] font-bold uppercase tracking-[.14em] text-[#69A7FF]">
                  {item.category?.name ?? "Anime"}
                </span>
                <strong className="mt-2 line-clamp-3 text-sm font-semibold leading-5 text-[#F3F8FC]">
                  {item.title}
                </strong>
                <p className="mt-2 line-clamp-5 text-xs leading-5 text-[#B8C6D4]">
                  {item.synopsis?.trim() ||
                    "Consulta la ficha para ver la sinopsis y todos los detalles."}
                </p>
              </div>
            </div>
            <Card.Content className="gap-1 px-3.5 py-3.5">
              <Card.Title className="line-clamp-2 text-sm font-semibold leading-5 text-[#F3F8FC]">
                {item.title}
              </Card.Title>
              <Card.Description className="text-xs leading-5 text-[#93A4B8]">
                {item.startDate
                  ? new Date(item.startDate).getUTCFullYear()
                  : "Sin fecha"}
              </Card.Description>
            </Card.Content>
          </Link>
        </Card>
      ))}
    </div>
  );
}
