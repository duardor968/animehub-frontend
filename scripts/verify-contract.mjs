import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname } from "node:path";
const args = process.argv.slice(2);
const draft = args[0] === "--draft" && args.length === 2;
if (args.length && !draft)
  throw new Error("Usage: verify-contract.mjs [--draft metadata.json]");
const source = JSON.parse(
  readFileSync(draft ? args[1] : "contracts/source.json", "utf8"),
);
if (draft) {
  if (source.workingTree !== true || !source.baseCommit || !source.sourcePath)
    throw new Error("Invalid draft provenance");
  const head = execFileSync(
    "git",
    ["-C", dirname(source.sourcePath), "rev-parse", "HEAD"],
    { encoding: "utf8" },
  ).trim();
  if (head !== source.baseCommit)
    throw new Error("Draft base commit changed; regenerate draft");
}
const bytes = readFileSync(
  draft ? source.sourcePath : "contracts/openapi.json",
);
const hash = createHash("sha256").update(bytes).digest("hex");
if (hash !== source.sha256) throw new Error("Pinned OpenAPI checksum mismatch");
if (JSON.parse(bytes).info.version !== source.apiVersion)
  throw new Error("Pinned API version mismatch");
console.log(
  draft
    ? `Draft OpenAPI ${source.apiVersion} verified: working tree based on ${source.baseCommit}; not a release pin`
    : `OpenAPI ${source.apiVersion} verified: ${source.commit}`,
);
