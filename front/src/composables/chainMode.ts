// Single source of truth for "are we running against the local demo
// Hardhat node (chain 31337) or a real deployed network (Sepolia today,
// an L2 once migrated)?" — previously redefined identically in 4 files
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
// the front should target. "sepolia" is the default and today's only real
// deployment; "l2" (Base) is added ahead of the actual migration so the
// rest of the app can start branching on it, without switching anything
// over yet — nothing sets VITE_CHAIN=l2 anywhere at this point, so this
// introduces a dead branch on purpose, not a behavior change.
export type RemoteChainMode = "sepolia" | "l2";
export const remoteChainMode: RemoteChainMode = import.meta.env.VITE_CHAIN === "l2" ? "l2" : "sepolia";
