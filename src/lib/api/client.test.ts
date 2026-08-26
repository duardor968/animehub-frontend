import { describe, expect, it } from "vitest";
import { ApiResponseError, isApiNotFoundError } from "./client";

describe("isApiNotFoundError", () => {
  it("classifies only a real API 404 as not found", () => {
    expect(isApiNotFoundError(new ApiResponseError(404, "No existe"))).toBe(
      true,
    );
    expect(isApiNotFoundError(new ApiResponseError(503, "No disponible"))).toBe(
      false,
    );
    expect(isApiNotFoundError(new Error("Fallo de red"))).toBe(false);
  });
});
