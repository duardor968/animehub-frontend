import { Card } from "@heroui/react";
import type { ComponentProps, ReactNode } from "react";

/** The card of an anime or an episode: one shape, hover and label style
 *  everywhere (styles in globals.css, `.media-card`). */
export function MediaCard({
  className = "",
  children,
  ...props
}: ComponentProps<typeof Card>) {
  return (
    <Card {...props} className={`media-card ${className}`}>
      <div className="media-card__clip">{children}</div>
    </Card>
  );
}

/** Artwork: a 2:3 poster or a 16:9 episode still, with its layers. */
export function MediaCardMedia({
  aspect,
  className = "",
  children,
}: {
  aspect: "poster" | "still";
  className?: string;
  children: ReactNode;
}) {
  const ratio = aspect === "poster" ? "aspect-[2/3]" : "aspect-video";
  return (
    <div className={`media-card__media ${ratio} ${className}`}>{children}</div>
  );
}

/** Layer shown over the artwork on hover or focus (pointer devices only).
 *  Place it before the labels it replaces. */
export function MediaCardOverlay({ children }: { children: ReactNode }) {
  return (
    <div aria-hidden="true" className="media-card__overlay">
      {children}
    </div>
  );
}

/** Corner label on the artwork: category, episode number or time. */
export function MediaCardLabel({
  position = "bottom",
  tone = "default",
  children,
}: {
  position?: "top" | "bottom";
  tone?: "default" | "accent";
  children: ReactNode;
}) {
  const modifiers = [
    position === "top" && "media-label--top",
    tone === "accent" && "media-label--accent",
  ]
    .filter(Boolean)
    .join(" ");
  return <span className={`media-label ${modifiers}`}>{children}</span>;
}

/** Title (two lines) and one line of facts under the artwork. */
export function MediaCardBody({
  title,
  meta,
  children,
}: {
  title: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card.Content>
      <Card.Title>{title}</Card.Title>
      {meta ? <Card.Description>{meta}</Card.Description> : null}
      {children}
    </Card.Content>
  );
}
