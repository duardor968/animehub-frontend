import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * globals.css imports HeroUI's stylesheets one by one instead of the whole
 * bundle. These tests keep that list in sync with the components the app
 * imports: a new component without its stylesheet would render unstyled.
 */

/** Stylesheets each @heroui/react export needs, including the ones its parts
 *  render (close buttons, spinners…). Exports that render nothing styled map
 *  to an empty list. */
const stylesheets: Record<string, string[]> = {
  AlertDialog: ["alert-dialog", "close-button"],
  Button: ["button"],
  Card: ["card"],
  Checkbox: ["checkbox"],
  CheckboxGroup: ["checkbox-group"],
  Chip: ["chip"],
  Disclosure: ["disclosure"],
  Drawer: ["drawer", "close-button"],
  I18nProvider: [],
  InputGroup: ["input-group"],
  Label: ["label"],
  ListBox: ["list-box", "list-box-item"],
  Pagination: ["pagination"],
  ProgressCircle: ["progress-circle"],
  Radio: ["radio"],
  RadioGroup: ["radio-group"],
  SearchField: ["search-field", "close-button"],
  Select: ["select"],
  Slider: ["slider"],
  Spinner: ["spinner"],
  Tabs: ["tabs"],
  Tag: ["tag", "close-button"],
  TagGroup: ["tag-group"],
  TextField: ["textfield"],
  Toast: ["toast", "close-button", "spinner"],
  ToggleButton: ["toggle-button"],
  ToggleButtonGroup: ["toggle-button-group"],
  Tooltip: ["tooltip"],
  toast: [],
  useOverlayState: [],
};

const root = process.cwd();
const globals = readFileSync(join(root, "src/app/globals.css"), "utf8");
const imported = [
  ...globals.matchAll(/@import "@heroui\/styles\/components\/([\w-]+)\.css"/g),
].map((match) => match[1]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [path]
      : [];
  });
}

function heroUiImports() {
  const names = new Set<string>();
  for (const file of sourceFiles(join(root, "src"))) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(
      /import\s*\{([^}]*)\}\s*from\s*"@heroui\/react"/g,
    )) {
      for (const part of match[1].split(",")) {
        const name = part.trim();
        if (name && !name.startsWith("type ")) names.add(name.split(" as ")[0]);
      }
    }
  }
  return names;
}

describe("HeroUI stylesheets", () => {
  it("imports exactly the stylesheets of the components the app uses", () => {
    const needed = new Set<string>();
    for (const name of heroUiImports()) {
      expect(
        stylesheets,
        `Add ${name}'s stylesheets to globals.css and to this map`,
      ).toHaveProperty(name);
      stylesheets[name].forEach((sheet) => needed.add(sheet));
    }
    expect([...imported].sort()).toEqual([...needed].sort());
  });

  it("keeps HeroUI's import order (shared primitives first)", () => {
    const index = readFileSync(
      join(root, "node_modules/@heroui/styles/dist/components/index.css"),
      "utf8",
    );
    const order = [...index.matchAll(/@import "\.\/([\w-]+)\.css"/g)].map(
      (match) => match[1],
    );
    expect(imported).toEqual(order.filter((sheet) => imported.includes(sheet)));
  });
});
