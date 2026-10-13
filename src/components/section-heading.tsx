import { Typography } from "@heroui/react";
import { linkVariants } from "@heroui/styles";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

const link = linkVariants();

/** Section title, with an optional link to the full list on the same line. */
export function SectionHeading({
  id,
  title,
  more,
}: {
  id?: string;
  title: string;
  more?: { href: string; label: string };
}) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4">
      <Typography type="h2" id={id}>
        {title}
      </Typography>
      {more ? (
        <Link href={more.href} className={`${link.base()} shrink-0 text-sm`}>
          {more.label}
          <ArrowRight aria-hidden="true" className={link.icon()} />
        </Link>
      ) : null}
    </div>
  );
}
