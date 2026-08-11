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
  const href = (target: number) => {
    const next = new URLSearchParams(params);
    next.set("page", String(target));
    return `?${next}`;
  };
  return (
    <nav className="pagination" aria-label="Paginación">
      {page > 1 ? (
        <Link href={href(page - 1)} aria-label="Página anterior">
          <ChevronLeft size={17} />
        </Link>
      ) : (
        <span />
      )}
      <p>
        <strong>{page}</strong>
        <span> / {totalPages}</span>
      </p>
      {page < totalPages ? (
        <Link href={href(page + 1)} aria-label="Página siguiente">
          <ChevronRight size={17} />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
