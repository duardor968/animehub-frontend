import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const source = JSON.parse(readFileSync("contracts/source.json", "utf8"));
const bytes = readFileSync("contracts/openapi.json");
const hash = createHash("sha256").update(bytes).digest("hex");
if (hash !== source.sha256) throw new Error("Pinned OpenAPI checksum mismatch");
if (JSON.parse(bytes).info.version !== source.apiVersion)
  throw new Error("Pinned API version mismatch");
console.log(`OpenAPI ${source.apiVersion} verified: ${source.commit}`);
