import { describe, expect, it, vi } from "vitest";
import { ApiResponseError } from "@/lib/api/client";
import { fetchHome } from "@/lib/api/home";
import HomePage from "./page";

vi.mock("@/lib/api/home", () => ({ fetchHome: vi.fn() }));
vi.mock("@/components/home/home-view", () => ({ HomeView: () => null }));

describe("HomePage", () => {
  it("renders the home, not an error page, when the API limits the server", async () => {
    vi.mocked(fetchHome).mockRejectedValue(
      new ApiResponseError(429, "Too Many Requests", 60_000),
    );
    const page = await HomePage();
    expect(page.props).toEqual({ initialHome: null });
  });
});
