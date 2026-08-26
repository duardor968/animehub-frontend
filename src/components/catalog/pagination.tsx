import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

export function Pagination({
  page,
  totalPages,
  params,
}: {
  page: number;
  totalPages: number;
  params: URLSearchParams;
}) {
  if (totalPages <= 1 || page < 1 || page > totalPages) return null;

  const href = (target: number) => {
    const next = new URLSearchParams(params);
    next.set("page", String(target));
    return `?${next}`;
  };
  return (
    <nav
      className="mt-10 flex items-center justify-center gap-3"
      aria-label="Paginación"
    >
      {page > 1 ? (
        <Link
          className="grid size-11 place-items-center rounded-lg border border-white/10 bg-[#0B1621] text-[#F3F8FC] transition-colors hover:border-[#5FA8FF]/45 hover:bg-[#102130]"
          href={href(page - 1)}
          aria-label="Página anterior"
        >
          <ChevronLeft size={17} />
        </Link>
      ) : (
        <span />
      )}
      <p className="min-w-20 text-center text-sm text-[#8FA3B4]">
        <strong>{page}</strong>
        <span> / {totalPages}</span>
      </p>
      {page < totalPages ? (
        <Link
          className="grid size-11 place-items-center rounded-lg border border-white/10 bg-[#0B1621] text-[#F3F8FC] transition-colors hover:border-[#5FA8FF]/45 hover:bg-[#102130]"
          href={href(page + 1)}
          aria-label="Página siguiente"
        >
          <ChevronRight size={17} />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
