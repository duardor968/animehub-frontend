import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api/client";
import { findMatch, SearchBox } from "./search-box";

const push = vi.fn();
let pathname = "/";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => pathname,
}));
vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn() }));

const anime = (slug: string, title: string) => ({
  id: slug,
  slug,
  title,
  status: "AIRING",
  mature: false,
  category: { id: "tv", slug: "tv-anime", name: "TV Anime" },
});

beforeEach(() => {
  // jsdom has no layout APIs.
  Element.prototype.scrollIntoView = vi.fn();
  push.mockReset();
  pathname = "/";
  vi.mocked(apiFetch)
    .mockReset()
    .mockResolvedValue({
      data: [
        anime("sousou-no-frieren", "Sousou no Frieren"),
        anime("fruits-basket", "Fruits Basket"),
      ],
    });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const combobox = () => screen.getByRole("combobox", { name: "Buscar anime" });

async function typeAndLoad(value: string) {
  vi.useFakeTimers();
  const input = combobox();
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
  await act(() => vi.advanceTimersByTimeAsync(300));
  return input;
}

describe("SearchBox", () => {
  it("shows the active search query and follows route updates", () => {
    const { rerender } = render(<SearchBox initialQuery="naruto" />);

    expect(combobox()).toHaveValue("naruto");

    rerender(<SearchBox initialQuery="bleach" />);
    expect(combobox()).toHaveValue("bleach");
  });

  it("resets the header field after navigating to another page", () => {
    const { rerender } = render(<SearchBox compact />);
    fireEvent.change(combobox(), { target: { value: "fruits" } });
    expect(combobox()).toHaveValue("fruits");

    pathname = "/anime/fruits-basket";
    rerender(<SearchBox compact />);
    expect(combobox()).toHaveValue("");
  });

  it("localizes the clear control and avoids iOS zoom and spellcheck", () => {
    render(<SearchBox initialQuery="one" />);

    expect(
      screen.getByRole("button", { name: "Limpiar búsqueda" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    expect(combobox()).toHaveClass("text-base", "lg:pointer-fine:text-sm");
    expect(combobox()).toHaveAttribute("spellcheck", "false");
    expect(combobox()).toHaveAttribute("autocomplete", "off");
    expect(combobox()).toHaveAttribute("maxlength", "100");
  });

  it("keeps combobox options out of the tab order and submits the query option once", () => {
    render(<SearchBox />);
    const input = combobox();

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "naruto" } });
    const option = screen.getByRole("option", { name: /Buscar “naruto”/ });
    expect(option).toHaveAttribute("tabindex", "-1");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant", option.id);
    fireEvent.keyDown(input, { key: "Enter" });

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/buscar?q=naruto");
  });

  it("opens a suggested anime with Enter without a wasted search navigation", async () => {
    render(<SearchBox compact />);
    const input = await typeAndLoad("fr");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    // The active option is kept in view inside the scrolling list.
    expect(Element.prototype.scrollIntoView).toHaveBeenLastCalledWith({
      block: "nearest",
    });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/anime/sousou-no-frieren");
  });

  it("closes the suggestions on the first Escape and clears on the second", async () => {
    render(<SearchBox />);
    const input = await typeAndLoad("fr");
    expect(input).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).toHaveValue("fr");

    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveValue("");
  });

  it("keeps previous suggestions dimmed while the next query loads", async () => {
    render(<SearchBox />);
    const input = await typeAndLoad("fr");
    expect(screen.getByRole("status")).toHaveTextContent("2 sugerencias");

    fireEvent.change(input, { target: { value: "fru" } });
    expect(screen.getByRole("listbox")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("option", { name: /Fruits Basket/ })).toHaveClass(
      "opacity-55",
    );
    expect(screen.getByText("Buscando sugerencias…")).toBeInTheDocument();
  });

  it("only requests suggestions while focused and caps the query length", async () => {
    render(<SearchBox initialQuery="naruto" />);
    vi.useFakeTimers();
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(apiFetch).not.toHaveBeenCalled();

    const input = combobox();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "a".repeat(150) } });
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(input).toHaveValue("a".repeat(100));
    expect(vi.mocked(apiFetch).mock.calls.at(-1)?.[0]).toBe(
      `/catalog/suggestions?q=${"a".repeat(100)}`,
    );
  });

  it("focuses the field with Ctrl+K and leaves the caret after the text", () => {
    render(<SearchBox initialQuery="naruto" />);
    const input = combobox() as HTMLInputElement;
    // jsdom has no layout: report the field as rendered.
    vi.spyOn(input, "getClientRects").mockReturnValue([
      {},
    ] as unknown as DOMRectList);

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(input).toHaveFocus();
    expect(input.selectionStart).toBe("naruto".length);
  });

  it("ignores Ctrl+K while a modal dialog is open", () => {
    render(
      <>
        <SearchBox initialQuery="naruto" />
        <div role="dialog" aria-modal="true" />
      </>,
    );
    const input = combobox();
    vi.spyOn(input, "getClientRects").mockReturnValue([
      {},
    ] as unknown as DOMRectList);

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(input).not.toHaveFocus();
  });

  it("opens /buscar with Ctrl+K when the header field is hidden", () => {
    render(<SearchBox compact />);
    vi.spyOn(combobox(), "getClientRects").mockReturnValue(
      [] as unknown as DOMRectList,
    );

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(push).toHaveBeenCalledWith("/buscar");
  });
});

describe("findMatch", () => {
  it("matches ignoring case and accents and maps back to the label", () => {
    expect(findMatch("Acción en el espacio", "accion")).toEqual({
      start: 0,
      end: 6,
    });
    expect(findMatch("Sousou no Frieren", "FRIE")).toEqual({
      start: 10,
      end: 14,
    });
    expect(findMatch("Naruto", "bleach")).toBeNull();
  });
});
