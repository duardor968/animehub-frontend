import { Skeleton } from "@heroui/react";
import { PageHeader, pageMainClass } from "@/components/page-header";
import { PosterGridSkeleton } from "@/components/poster-grid";
import { MAIN_CONTENT_ID } from "@/lib/navigation";

/** The search page's shape while its results load. */
export default function SearchLoading() {
  return (
    <main
      id={MAIN_CONTENT_ID}
      tabIndex={-1}
      aria-busy="true"
      aria-label="Cargando resultados"
      className={pageMainClass}
    >
      <PageHeader title="Buscar" />
      <div aria-hidden="true">
        <Skeleton className="h-10 w-full max-w-2xl rounded-3xl" />
        <div className="mb-6 mt-8 flex items-center gap-4">
          <Skeleton className="h-10 w-28 rounded-3xl" />
          <Skeleton className="h-4 w-20" />
        </div>
        <PosterGridSkeleton />
      </div>
    </main>
  );
}
