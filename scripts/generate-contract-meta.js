import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Re-exec under `node --import tsx/esm` so that `.ts` files can be
// imported for real (evaluated, not regex-parsed) — tsx's loader must be
// registered via --import, `node:module`'s register() API triggers the
// (deprecated, now removed) --loader code path instead and fails.
if (!process.env.LA_MEUTE_TSX_LOADED) {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx/esm", fileURLToPath(import.meta.url)],
    { stdio: "inherit", env: { ...process.env, LA_MEUTE_TSX_LOADED: "1" } },
  );
  process.exit(result.status ?? 1);
}

const CONTRACT_TS_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "front", "src", "contract.ts");
const OUT_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "front", "src", "contract-meta.json");

const mod = await import(CONTRACT_TS_PATH);

// One entry per chain id (mirrors contract.ts's own DEPLOYMENTS) rather
// than a single flat address/deployBlock — sync-dao.js picks the right
// entry via CHAIN_ID so this file doesn't need regenerating on every
// chain switch, only on an actual redeployment.
const deployments = Object.fromEntries(
  Object.entries(mod.DEPLOYMENTS).map(([chainId, d]) => [chainId, { address: d.address, deployBlock: d.deployBlock.toString() }]),
);

writeFileSync(OUT_PATH, JSON.stringify({
  deployments,
  version: mod.CONTRACT_VERSION,
  abi: mod.CONTRACT_ABI,
}, null, 2) + "\n");

console.log(`Wrote ${OUT_PATH}`);
