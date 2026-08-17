// Single source of truth for "are we running against the local demo
// Hardhat node (chain 31337) or a real deployed network (Base Sepolia
// today, Sepolia as a rollback)?" — previously redefined identically in 4 files
// (useWallet.ts, useMeute.ts, useDiscordLink.ts, useLocalAutoRefresh.ts).
// Kept in its own module rather than exported from useWallet.ts to avoid
// import cycles, since useMeute.ts/useDiscordLink.ts already depend on
// useWallet.ts for other things.
//
// DEV in addition to VITE_CHAIN: DEV is pinned to `false` in a production
// build regardless of env vars, so this can never accidentally read as
// "local" outside of `vite dev`/`npm run demo`.
export const isLocal = import.meta.env.DEV && import.meta.env.VITE_CHAIN === "local";

// Only meaningful when `isLocal` is false: which real, deployed network
// the front should target. Production has been "l2" (Base Sepolia) since
// 2026-08-03 — Netlify sets VITE_CHAIN=l2, and the sync-dao cron runs on
// CHAIN_ID=84532. "sepolia" is kept as the fallback because it is the
// documented rollback path (the L1 deployment is still live and its
// address still in DEPLOYMENTS), not because it is the current target:
// leaving VITE_CHAIN unset means Sepolia, so a Netlify env wiped by
// accident degrades to a working chain rather than to nothing.
export type RemoteChainMode = "sepolia" | "l2";
export const remoteChainMode: RemoteChainMode = import.meta.env.VITE_CHAIN === "l2" ? "l2" : "sepolia";
