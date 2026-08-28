"use client";

import { Button } from "@heroui/react";
import Autoplay from "embla-carousel-autoplay";
import useEmblaCarousel from "embla-carousel-react";
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Info,
  Pause,
  Play,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { FeaturedAnime } from "@/lib/api/client";
import { formatStatus } from "@/lib/format";
import { AnimeImage } from "../anime-image";

export function FeaturedHero({ anime }: { anime: FeaturedAnime[] }) {
  const router = useRouter();
  const [autoplay] = useState(() =>
    Autoplay({
      delay: 7_000,
      stopOnInteraction: false,
      stopOnMouseEnter: false,
    }),
  );
  const [viewportRef, embla] = useEmblaCarousel(
    {
      loop: true,
      align: "start",
    },
    [autoplay],
  );
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState(true);
  const sync = useCallback(
    () => embla && setSelected(embla.selectedScrollSnap()),
    [embla],
  );
  useEffect(() => {
    if (!embla) return;
    embla.on("select", sync);
    embla.on("reInit", sync);
    return () => {
      embla.off("select", sync);
      embla.off("reInit", sync);
    };
  }, [embla, sync]);
  useEffect(() => {
    if (!embla) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncAutoplay = () => {
      if (reducedMotion.matches) {
        autoplay.stop();
        setPlaying(false);
        return;
      }
      if (document.visibilityState === "visible" && playing) autoplay.play();
      else autoplay.stop();
    };
    syncAutoplay();
    document.addEventListener("visibilitychange", syncAutoplay);
    reducedMotion.addEventListener("change", syncAutoplay);
    return () => {
      document.removeEventListener("visibilitychange", syncAutoplay);
      reducedMotion.removeEventListener("change", syncAutoplay);
    };
  }, [autoplay, embla, playing]);

  return (
    <section
      className="featured-hero group relative min-h-[560px] overflow-hidden bg-[#060B16] outline-none max-lg:min-h-[520px] max-sm:min-h-[640px]"
      aria-roledescription="carrusel"
      aria-label="Destacados"
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") embla?.scrollPrev();
        if (event.key === "ArrowRight") embla?.scrollNext();
      }}
      tabIndex={0}
    >
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {anime[selected]?.title}, destacado {selected + 1} de {anime.length}
      </p>
      <div className="overflow-hidden" ref={viewportRef}>
        <div className="flex touch-pan-y">
          {anime.map((item, index) => (
            <article
              className="featured-slide relative min-h-[560px] min-w-0 flex-[0_0_100%] max-lg:min-h-[520px] max-sm:min-h-[640px]"
              key={item.id}
              aria-label={`${index + 1} de ${anime.length}`}
            >
              <div className="absolute inset-0">
                <AnimeImage
                  src={item.backdropUrl}
                  fallbackSrc={item.posterUrl}
                  alt=""
                  priority
                  sizes="100vw"
                />
              </div>
              <div
                className="absolute inset-0 bg-[linear-gradient(90deg,#050A11_0%,rgba(5,10,17,.94)_25%,rgba(5,10,17,.46)_56%,rgba(5,10,17,.12)_100%),linear-gradient(0deg,#07101A_0%,transparent_38%)] max-sm:bg-[linear-gradient(0deg,#050A11_8%,rgba(5,10,17,.82)_52%,rgba(5,10,17,.18)_100%)]"
                aria-hidden="true"
              />
              <div className="featured-hero-inner relative z-10 mx-auto flex min-h-[560px] w-full max-w-[1600px] items-center px-6 pb-24 pt-16 max-lg:min-h-[520px] max-sm:min-h-[640px] max-sm:items-end max-sm:px-4 max-sm:pb-28 max-sm:pt-20">
                <div className="max-w-[610px] animate-[hero-in_.5s_ease-out_both]">
                  <span className="text-[11px] font-bold uppercase tracking-[.18em] text-[#69A7FF]">
                    Destacados
                  </span>
                  <h1 className="mt-3 max-w-[13ch] font-(family-name:--font-display) text-6xl font-bold leading-[.94] tracking-[-.055em] text-[#F3F8FC] text-shadow-lg max-lg:text-5xl max-sm:text-[clamp(2.6rem,14vw,4.5rem)]">
                    {item.title}
                  </h1>
                  <div className="mt-5 flex flex-wrap gap-x-3 gap-y-2 text-sm font-medium text-[#C4D2DE] [&>span:not(:last-child)]:after:ml-3 [&>span:not(:last-child)]:after:text-[#4C8FEF] [&>span:not(:last-child)]:after:content-['•']">
                    <span>{formatStatus(item.status)}</span>
                    {item.startDate && (
                      <span>{new Date(item.startDate).getUTCFullYear()}</span>
                    )}
                    {item.category && <span>{item.category.name}</span>}
                    {item.episodeCount ? (
                      <span>{item.episodeCount} episodios</span>
                    ) : null}
                  </div>
                  {item.genres.length > 0 && (
                    <p className="mt-3 text-sm font-semibold text-[#81B3FA]">
                      {item.genres
                        .slice(0, 3)
                        .map((genre) => genre.name)
                        .join(" · ")}
                    </p>
                  )}
                  <p className="mt-4 line-clamp-3 max-w-[57ch] text-[15px] leading-7 text-[#C4D2DE] max-sm:line-clamp-3 max-sm:text-sm max-sm:leading-6">
                    {item.synopsis}
                  </p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <Button
                      onPress={() => router.push(`/anime/${item.slug}`)}
                      className="h-11 rounded-full bg-[#2F81F7] px-6 font-semibold text-white shadow-[0_12px_34px_rgba(47,129,247,.25)] hover:bg-[#4B93F7]"
                    >
                      <Info size={17} /> Ver ficha
                    </Button>
                    {item.trailerUrl && (
                      <Button
                        onPress={() =>
                          window.open(
                            item.trailerUrl!,
                            "_blank",
                            "noopener,noreferrer",
                          )
                        }
                        variant="secondary"
                        className="h-11 rounded-full bg-white/10 px-6 font-semibold text-[#F3F8FC] shadow-none backdrop-blur-md hover:bg-white/16"
                      >
                        <Play size={16} /> Tráiler <ExternalLink size={13} />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
      {anime.length > 1 && (
        <div className="featured-controls absolute bottom-6 left-1/2 z-20 flex w-full max-w-[1600px] -translate-x-1/2 items-center gap-3 px-6 max-sm:bottom-5 max-sm:px-4">
          <Button
            isIconOnly
            variant="secondary"
            aria-label="Destacado anterior"
            className="h-11 w-11 rounded-full bg-white/10 text-[#F3F8FC] shadow-none backdrop-blur-md hover:bg-white/16"
            onPress={() => embla?.scrollPrev()}
          >
            <ArrowLeft size={20} />
          </Button>
          <span className="min-w-14 text-center font-mono text-xs font-semibold tracking-wider text-[#F3F8FC]">
            {String(selected + 1).padStart(2, "0")} /{" "}
            {String(anime.length).padStart(2, "0")}
          </span>
          <div
            className="flex items-center gap-1.5"
            aria-label="Elegir destacado"
          >
            {anime.map((item, index) => (
              <Button
                key={item.id}
                variant="ghost"
                aria-label={`Mostrar ${item.title}`}
                aria-current={index === selected ? "true" : undefined}
                onPress={() => embla?.scrollTo(index)}
                className="relative h-6 w-6 min-w-0 overflow-hidden rounded-full bg-transparent px-0 shadow-none transition-[width] duration-200 aria-[current=true]:w-12"
              >
                <span className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-[#8FA3B4]/28">
                  {index === selected && (
                    <span
                      key={`${selected}-${playing}`}
                      className="block h-full origin-left rounded-full bg-[#2F81F7] animate-[hero-progress_7000ms_linear_forwards]"
                      style={{
                        animationPlayState: playing ? "running" : "paused",
                      }}
                    />
                  )}
                </span>
              </Button>
            ))}
          </div>
          <Button
            isIconOnly
            variant="ghost"
            aria-label={playing ? "Pausar carrusel" : "Reanudar carrusel"}
            className="h-9 w-9 rounded-full text-[#C4D2DE] shadow-none hover:bg-white/10"
            onPress={() => {
              if (playing) autoplay.stop();
              else autoplay.play();
              setPlaying((value) => !value);
            }}
          >
            {playing ? <Pause size={15} /> : <Play size={15} />}
          </Button>
          <Button
            isIconOnly
            variant="secondary"
            aria-label="Destacado siguiente"
            className="h-11 w-11 rounded-full bg-white/10 text-[#F3F8FC] shadow-none backdrop-blur-md hover:bg-white/16"
            onPress={() => embla?.scrollNext()}
          >
            <ArrowRight size={20} />
          </Button>
        </div>
      )}
    </section>
  );
}
