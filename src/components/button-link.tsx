import { type ButtonVariants, buttonVariants } from "@heroui/styles";
import Link from "next/link";
import type { ComponentProps } from "react";

/** Navigation that looks like a HeroUI button (internal or external URL). */
export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & Pick<ButtonVariants, "variant" | "size">) {
  return (
    <Link {...props} className={buttonVariants({ variant, size, className })} />
  );
}
