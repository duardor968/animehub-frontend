import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="brand" href="/" aria-label="AnimeHub, inicio">
      <svg
        aria-hidden="true"
        className="brand-mark"
        viewBox="0 0 44 44"
        fill="none"
      >
        <path
          d="M7 35 18.7 8h6.4L37 35h-7.1l-2.2-5.8H15.6L13.4 35H7Z"
          fill="currentColor"
        />
        <path d="M17.9 23.2h7.5l-3.7-9.8-3.8 9.8Z" fill="#0B0A09" />
        <path d="M29.4 10.5h6v23.9h-6z" fill="#0B0A09" />
        <path d="M25.5 20.2h12v6h-12z" fill="#0B0A09" />
      </svg>
      {!compact && (
        <span className="brand-wordmark">
          Anime<span>Hub</span>
        </span>
      )}
    </Link>
  );
}
