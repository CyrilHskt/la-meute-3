import type { Chain } from "viem";

// MetaMask Embedded Wallets (formerly Web3Auth) needs its own chain config
// shape (CustomChainConfig), distinct from viem's `Chain` — this derives
// one from the other instead of maintaining a second, parallel chain
// definition that could drift from useWallet.ts's `activeChain`.
export function toEmbeddedWalletChainConfig(chain: Chain) {
  return {
    chainNamespace: "eip155" as const,
    chainId: `0x${chain.id.toString(16)}`,
    rpcTarget: chain.rpcUrls.default.http[0]!,
    displayName: chain.name,
    blockExplorerUrl: chain.blockExplorers?.default.url ?? "",
    ticker: chain.nativeCurrency.symbol,
    tickerName: chain.nativeCurrency.name,
    logo: "https://images.toruswallet.io/eth.svg",
  };
}

// Client ID from the MetaMask Embedded Wallets / Web3Auth dashboard
// (Sapphire Devnet project, see docs/local/l2-migration-reflection.md for
// the L2 work this onboarding effort builds on) — public, safe to expose
// client-side (same trust level as the app's other public RPC keys).
export const EMBEDDED_WALLET_CLIENT_ID = import.meta.env.VITE_EMBEDDED_WALLET_CLIENT_ID as string | undefined;
