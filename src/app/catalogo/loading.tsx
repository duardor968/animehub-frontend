import { Skeleton } from "@heroui/react";
import { PageHeader, pageMainClass } from "@/components/page-header";
import { PosterGridSkeleton } from "@/components/poster-grid";
import { MAIN_CONTENT_ID } from "@/lib/navigation";

/** The catalog's shape while its page loads. */
export default function CatalogLoading() {
  return (
    <main
      id={MAIN_CONTENT_ID}
      tabIndex={-1}
      aria-busy="true"
      aria-label="Cargando catálogo"
      className={pageMainClass}
    >
      <PageHeader title="Catálogo" />
      <div aria-hidden="true" className="mb-6 flex items-center gap-4">
        <Skeleton className="h-10 w-28 rounded-3xl" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="ml-auto h-10 w-56 rounded-3xl max-sm:hidden" />
      </div>
      <PosterGridSkeleton />
    </main>
  );
}
