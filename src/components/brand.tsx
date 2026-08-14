import Image from "next/image";
import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      className={
        compact
          ? "flex h-11 w-11 shrink-0 items-center overflow-hidden rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5FA8FF]"
          : "flex h-11 w-[148px] shrink-0 items-center overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5FA8FF] max-sm:w-[132px]"
      }
      href="/"
      aria-label="AnimeHub, inicio"
    >
      <Image
        src="/brand/animehub-lockup.png"
        width={compact ? 48 : 148}
        height={compact ? 11 : 34}
        sizes={compact ? "44px" : "148px"}
        priority
        alt="AnimeHub"
        className={
          compact
            ? "h-auto w-12 max-w-none object-contain object-left"
            : "h-auto w-[148px] max-w-full object-contain object-left"
        }
      />
    </Link>
  );
}
