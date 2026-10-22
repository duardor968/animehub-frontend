// Explicit local development only. Release contracts/source.json stays authoritative.
// Usage: node scripts/generate-draft-contract.mjs <api checkout> <external metadata.json>
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve, relative, isAbsolute } from "node:path";

const args = process.argv.slice(2);
if (args.length !== 2)
  throw new Error("Expected API checkout and external metadata path");
const api = resolve(args[0]);
const metadataPath = resolve(args[1]);
const frontend = process.cwd();
const metadataRelative = relative(frontend, metadataPath);
if (!metadataRelative.startsWith("..") && !isAbsolute(metadataRelative))
  throw new Error("Draft provenance must live outside the frontend repository");
const sourcePath = resolve(api, "openapi.json");
const bytes = readFileSync(sourcePath);
const document = JSON.parse(bytes);
const baseCommit = execFileSync("git", ["-C", api, "rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const source = {
  workingTree: true,
  sourcePath,
  baseCommit,
  sha256: createHash("sha256").update(bytes).digest("hex"),
  apiVersion: document.info.version,
};
writeFileSync(metadataPath, JSON.stringify(source, null, 2) + "\n");
execFileSync(
  process.execPath,
  ["scripts/verify-contract.mjs", "--draft", metadataPath],
  { stdio: "inherit" },
);
execFileSync(
  process.execPath,
  [
    "node_modules/openapi-typescript/bin/cli.js",
    sourcePath,
    "-o",
    "src/lib/api/generated.ts",
  ],
  { stdio: "inherit" },
);
execFileSync(
  process.execPath,
  [
    "node_modules/prettier/bin/prettier.cjs",
    "--write",
    "src/lib/api/generated.ts",
  ],
  { stdio: "inherit" },
);
console.log(
  "Draft types generated. Release contract checks remain unchanged; adopt a committed API contract before release.",
);
