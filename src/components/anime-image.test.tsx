import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={String(props.src)}
      alt={String(props.alt ?? "")}
      referrerPolicy={props.referrerPolicy as React.HTMLAttributeReferrerPolicy}
      onLoad={props.onLoad as React.ReactEventHandler<HTMLImageElement>}
      onError={props.onError as React.ReactEventHandler<HTMLImageElement>}
    />
  ),
}));

import { AnimeImage } from "./anime-image";

describe("AnimeImage", () => {
  it("falls back from frame to poster and finally to the neutral asset", () => {
    render(
      <AnimeImage
        src="https://example.com/frame.jpg"
        fallbackSrc="https://example.com/poster.jpg"
        alt="Fotograma"
      />,
    );

    let image = screen.getByRole("img", { name: "Fotograma" });
    expect(image).toHaveAttribute("src", "https://example.com/frame.jpg");
    fireEvent.error(image);
    image = screen.getByRole("img", { name: "Fotograma" });
    expect(image).toHaveAttribute("src", "https://example.com/poster.jpg");
    fireEvent.error(image);
    image = screen.getByRole("img", { name: "Fotograma" });
    expect(image).toHaveAttribute("src", "/brand/cinematic-fallback.png");
    fireEvent.load(image);
    expect(image.parentElement).toHaveClass("is-loaded");
    expect(image).toHaveAttribute("referrerPolicy", "no-referrer");
  });
});
