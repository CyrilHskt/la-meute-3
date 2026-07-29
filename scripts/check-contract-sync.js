import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import { loadAbi } from "./lib/abi.js";
import meta from "../front/src/contract-meta.json" with { type: "json" };

const compiledAbi = loadAbi(import.meta.url);

try {
  assert.deepStrictEqual(meta.abi, compiledAbi);
} catch {
  console.error(`::error::front/src/contract-meta.json CONTRACT_ABI is out of sync with the compiled contract (artifacts/contracts/Meute.sol/Meute.json). Recompile and regenerate via scripts/generate-contract-meta.js.`);
  process.exit(1);
}

const sourceVersionMatch = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "contracts", "Meute.sol"), "utf8")
  .match(/string public constant VERSION = "([^"]+)"/);
if (!sourceVersionMatch) throw new Error("VERSION not found in contracts/Meute.sol");

if (meta.version !== sourceVersionMatch[1]) {
  console.error(`::error::front/src/contract-meta.json CONTRACT_VERSION ("${meta.version}") does not match contracts/Meute.sol VERSION ("${sourceVersionMatch[1]}").`);
  process.exit(1);
}

console.log("contract-meta.json is in sync with the compiled contract.");
