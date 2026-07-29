import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import { loadAbi } from "./lib/abi.js";

const CONTRACT_TS_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "front", "src", "contract.ts");
const source = readFileSync(CONTRACT_TS_PATH, "utf8");

function extractAbi() {
  const match = source.match(/export const CONTRACT_ABI = (\[[\s\S]*?\]) as const;/);
  if (!match) throw new Error(`CONTRACT_ABI not found in ${CONTRACT_TS_PATH}`);
  return JSON.parse(match[1]);
}

function extractVersion() {
  const match = source.match(/export const CONTRACT_VERSION = "([^"]+)"/);
  if (!match) throw new Error(`CONTRACT_VERSION not found in ${CONTRACT_TS_PATH}`);
  return match[1];
}

const compiledAbi = loadAbi(import.meta.url);
const declaredAbi = extractAbi();

try {
  assert.deepStrictEqual(declaredAbi, compiledAbi);
} catch {
  console.error(`::error::front/src/contract.ts CONTRACT_ABI is out of sync with the compiled contract (artifacts/contracts/Meute.sol/Meute.json). Recompile and update CONTRACT_ABI by hand.`);
  process.exit(1);
}

const sourceVersionMatch = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "contracts", "Meute.sol"), "utf8")
  .match(/string public constant VERSION = "([^"]+)"/);
if (!sourceVersionMatch) throw new Error("VERSION not found in contracts/Meute.sol");

if (extractVersion() !== sourceVersionMatch[1]) {
  console.error(`::error::front/src/contract.ts CONTRACT_VERSION ("${extractVersion()}") does not match contracts/Meute.sol VERSION ("${sourceVersionMatch[1]}").`);
  process.exit(1);
}

console.log("contract.ts is in sync with the compiled contract.");
