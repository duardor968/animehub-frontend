import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { AnimeImage } from "./anime-image";

afterEach(cleanup);

const BACKDROP = "https://cdn.animeav1.com/backdrops/1.jpg";
const POSTER = "https://cdn.animeav1.com/covers/1.jpg";

describe("AnimeImage", () => {
  it("renders priority images visible in the server HTML (no hydration gate)", () => {
    const html = renderToString(<AnimeImage src={POSTER} alt="" priority />);
    expect(html).toContain("anime-image is-priority");
    expect(html).toContain('fetchPriority="high"');
    expect(html).toContain('loading="eager"');
  });

  it("fades in lazy images only after they load", async () => {
    const { container } = render(<AnimeImage src={POSTER} alt="" />);
    const wrapper = container.firstElementChild!;
    expect(wrapper).toHaveClass("is-loading");
    expect(container.querySelector("img")).toHaveAttribute("loading", "lazy");
    fireEvent.load(container.querySelector("img")!);
    await waitFor(() => expect(wrapper).toHaveClass("is-loaded"));
  });

  it("serves the mobile art below 640px through <picture>", () => {
    const { container } = render(
      <AnimeImage src={BACKDROP} mobileSrc={POSTER} alt="" priority />,
    );
    const source = container.querySelector("picture source");
    expect(source).toHaveAttribute("media", "(max-width: 639.98px)");
    expect(source).toHaveAttribute("srcset", POSTER);
    expect(container.querySelector("picture img")).toHaveAttribute(
      "src",
      BACKDROP,
    );
  });

  it("falls back to the next source and then to a branded placeholder", () => {
    const { container } = render(
      <AnimeImage src={BACKDROP} fallbackSrc={POSTER} alt="Fotograma" />,
    );
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toHaveAttribute("src", POSTER);
    fireEvent.error(container.querySelector("img")!);
    expect(screen.getByRole("img", { name: "Fotograma" })).toHaveClass(
      "anime-image-placeholder",
    );
  });
});
