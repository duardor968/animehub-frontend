import { Skeleton } from "@heroui/react";
import { pageMainClass } from "@/components/page-header";
import { PosterGridSkeleton } from "@/components/poster-grid";
import { MAIN_CONTENT_ID } from "@/lib/navigation";

/** An anime's page while it loads: poster and facts, then its episodes. */
export default function AnimeLoading() {
  return (
    <main
      id={MAIN_CONTENT_ID}
      tabIndex={-1}
      aria-busy="true"
      aria-label="Cargando anime"
      className={pageMainClass}
    >
      <div aria-hidden="true">
        <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-x-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <Skeleton className="aspect-[2/3] rounded-xl" />
          <div className="flex flex-col gap-3">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <div className="mt-4 flex flex-col gap-2 max-sm:hidden">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
            <Skeleton className="mt-4 h-10 w-40 rounded-3xl max-sm:hidden" />
          </div>
        </div>
        <Skeleton className="mb-4 mt-12 h-7 w-32" />
        <PosterGridSkeleton count={10} aspect="still" />
      </div>
    </main>
  );
}
