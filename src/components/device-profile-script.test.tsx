import { render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { deviceProfileScript } from "@/lib/device-script";
import { DeviceProfileScript } from "./device-profile-script";

describe("DeviceProfileScript", () => {
  it("is part of the server HTML, so it runs before the first paint", () => {
    expect(renderToString(<DeviceProfileScript />)).toContain(
      deviceProfileScript,
    );
  });

  it("is never created by a client render (React can't run it)", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = render(<DeviceProfileScript />);
    expect(container.querySelector("script")).toBeNull();
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
