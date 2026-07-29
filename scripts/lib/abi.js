import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export function loadAbi(callerImportMetaUrl) {
  const callerDir = dirname(fileURLToPath(callerImportMetaUrl));
  const artifactPath = join(callerDir, "..", "artifacts", "contracts", "Meute.sol", "Meute.json");
  try {
    return JSON.parse(readFileSync(artifactPath, "utf8")).abi;
  } catch {
    throw new Error(`ABI not found (${artifactPath}) — run \`npx hardhat compile\` first.`);
  }
}
