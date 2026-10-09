import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import lockup1x from "@/assets/brand/animehub-lockup-148.webp";
import lockup2x from "@/assets/brand/animehub-lockup-296.webp";

// Static imports get content-hashed URLs under /_next/static/media, which
// Next serves with an immutable one-year cache.
const assetUrl = (asset: StaticImageData | string) =>
  typeof asset === "string" ? asset : asset.src;

/** The AnimeHub lockup (mark + wordmark), 148 CSS px wide. */
export function BrandLockup({ className = "" }: { className?: string }) {
  return (
    <picture className="contents">
      <source
        srcSet={`${assetUrl(lockup1x)} 1x, ${assetUrl(lockup2x)} 2x`}
        type="image/webp"
      />
      <Image
        src={lockup2x}
        width={148}
        height={34}
        alt="AnimeHub"
        loading="eager"
        className={`h-auto w-[148px] max-w-full object-contain object-left ${className}`}
      />
    </picture>
  );
}

export function Brand() {
  return (
    <Link
      className="flex h-11 w-[148px] shrink-0 items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-4 focus-visible:ring-offset-background max-sm:w-[132px]"
      href="/"
      aria-label="AnimeHub, inicio"
    >
      <BrandLockup />
    </Link>
  );
}
