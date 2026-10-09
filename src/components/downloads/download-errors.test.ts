import { describe, expect, it } from "vitest";
import {
  ApiConnectionError,
  ApiResponseError,
  ApiTimeoutError,
} from "@/lib/api/client";
import {
  ClickNLoadError,
  describeApiError,
  describeClickNLoadError,
  describeMyJdError,
} from "./download-errors";

describe("download error copy", () => {
  it("maps API problems and network failures to Spanish", () => {
    expect(describeApiError(new ApiConnectionError()).title).toBe(
      "Sin conexión con AnimeHub",
    );
    expect(describeApiError(new ApiTimeoutError()).title).toBe(
      "La fuente tardó demasiado",
    );
    expect(describeApiError(new ApiResponseError(429, "Too Many")).title).toBe(
      "Demasiadas solicitudes",
    );
    expect(
      describeApiError(
        new ApiResponseError(503, "AnimeAV1 is temporarily unavailable."),
      ).title,
    ).toBe("AnimeAV1 no está disponible");
    expect(
      describeApiError(
        new ApiResponseError(400, "No episodes match the requested scope."),
      ).detail,
    ).toBe("Ningún episodio coincide con los números indicados.");
  });

  it("only warns about duplicates when the submission may have arrived", () => {
    const refused = new ClickNLoadError("unreachable");
    expect(refused.maybeDelivered).toBe(false);
    expect(describeClickNLoadError(refused).detail).toMatch(/red local/);
    expect(describeClickNLoadError(refused).detail).not.toMatch(/duplic/);
    const uncertain = new ClickNLoadError("uncertain");
    expect(uncertain.maybeDelivered).toBe(true);
    expect(describeClickNLoadError(uncertain).detail).toMatch(/duplic/);
  });

  it("reads MyJDownloader status codes and error types", () => {
    expect(
      describeMyJdError(
        new Error("403: Forbidden", { cause: { type: "AUTH_FAILED" } }),
      ),
    ).toBe("Correo o contraseña incorrectos.");
    expect(describeMyJdError(new Error("500: "))).toMatch(/no responde/);
    expect(describeMyJdError(new TypeError("Failed to fetch"))).toMatch(
      /Revisa tu conexión/,
    );
  });
});
