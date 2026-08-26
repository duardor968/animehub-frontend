import { describe, expect, it, vi } from "vitest";
import { ApiConnectionError, ApiResponseError } from "./client";
import { loadAnime } from "./anime";

describe("loadAnime", () => {
  it("returns null only when the API confirms a 404", async () => {
    const fetcher = vi.fn(async () => {
      throw new ApiResponseError(404, "No existe");
    });

    await expect(loadAnime("obra inexistente", fetcher)).resolves.toBeNull();
    expect(fetcher).toHaveBeenCalledWith("/anime/obra%20inexistente");
  });

  it.each([
    new ApiResponseError(500, "Fallo interno"),
    new ApiResponseError(503, "No disponible"),
    new ApiConnectionError(),
  ])("keeps %s retryable instead of turning it into a 404", async (error) => {
    const fetcher = vi.fn(async () => {
      throw error;
    });

    await expect(loadAnime("mob-sekai", fetcher)).rejects.toBe(error);
  });
});
