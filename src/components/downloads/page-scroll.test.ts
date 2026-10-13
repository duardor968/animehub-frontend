import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Opening Preferences (or any drawer) must leave the page where it was, with
 * the sticky header in place. Both depend on globals.css rather than on the
 * drawer, so they are checked there.
 */
const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

describe("page scroll around the download drawer", () => {
  it("doesn't scroll the page when a header control takes focus", () => {
    // scroll-padding on html makes the browser scroll to "reveal" the
    // sticky header's buttons (458 px up from 800 when opening Preferences).
    expect(css).not.toMatch(/html\s*\{[^}]*scroll-padding/);
    expect(css).toMatch(/main \*\s*\{\s*scroll-margin-top/);
  });

  it("keeps the header sticky while a drawer locks the page", () => {
    // overflow-x: hidden turns the body into a scroll container once html
    // gets overflow: hidden, and the header then scrolls away with it.
    expect(css).toMatch(/body\s*\{[^}]*overflow-x:\s*clip;/);
  });
});
