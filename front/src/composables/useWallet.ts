import { ref } from "vue";
import { createPublicClient, createWalletClient, custom, http, getContract, type Address, type Chain } from "viem";
import { sepolia, hardhat } from "viem/chains";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../contract";
// Direct `i18n.global.t` rather than the `useI18n()` composable: these
// guards live in plain module-level functions (the singleton pattern used
// throughout this file), not inside a component's setup(), where
// `useI18n()` requires an active injection context.
import { i18n } from "../i18n";

// Target network: Sepolia by default (the real, committed deployment), or
// the local Hardhat node to test the whole cycle in a few seconds (time
// advancement via networkHelpers) instead of real days. Configured via
// front/.env.local (never committed, see *.local in .gitignore) — never
// touches contract.ts, which stays the source of truth for the Sepolia
// deployment.
// import.meta.env.DEV in addition to VITE_CHAIN: DEV is pinned to `false`
// by Vite for every `vite build` (production), regardless of the content
// of a stray .env.local present by mistake — guaranteed elimination at
// compile time, not just "this file should never be committed".
const isLocal = import.meta.env.DEV && import.meta.env.VITE_CHAIN === "local";
const chain: Chain = isLocal ? hardhat : sepolia;
// Locally, the address isn't fixed: the demo panel (demo/server.mjs)
// redeploys a brand-new contract on every reset, so a new address every
// time. `let` rather than `const` so it can be refreshed without
// restarting the dev server — see syncLocalContractAddress.
let contractAddress = (import.meta.env.VITE_CONTRACT_ADDRESS as Address | undefined) ?? CONTRACT_ADDRESS;

const DEMO_SERVER_URL = "http://127.0.0.1:4100";

/** Fetches the current address from the demo panel. No effect outside
 *  local mode — never called (or even reachable) in prod. */
async function syncLocalContractAddress() {
  if (!isLocal) return;
  try {
    const res = await fetch(`${DEMO_SERVER_URL}/api/state`);
    if (!res.ok) return;
    const data = (await res.json()) as { contractAddress?: Address | null };
    if (data.contractAddress) contractAddress = data.contractAddress;
  } catch {
    // The demo panel might not be running — not blocking, we keep the last
    // known address.
  }
}
const address = ref<Address | null>(null);
const wrongNetwork = ref(false);
const noWalletDetected = ref(false);

// Read-only: requires no wallet, works even for a visitor without MetaMask
// installed. Don't use `custom(window.ethereum)` here: that would require
// a wallet just to display public stats.
//
// VITE_RPC_URL (Alchemy) rather than viem's default public RPC: the
// latter (thirdweb for Sepolia) proved flaky in prod as traffic grew
// (intermittent network failures observed directly in the browser,
// invisible locally/CLI) — no secret key to protect here, a read-only RPC
// key authorizes no transaction, only lets you restrict by domain in
// Alchemy if needed.
const publicClient = createPublicClient({
  chain,
  transport: http(import.meta.env.VITE_RPC_URL as string | undefined),
});

function getInjected() {
  return (window as unknown as { ethereum?: Record<string, unknown> }).ethereum;
}

async function connect() {
  const injected = getInjected();
  if (!injected) {
    noWalletDetected.value = true;
    return;
  }
  noWalletDetected.value = false;
  attachWalletListeners();

  const walletClient = createWalletClient({
    chain,
    transport: custom(injected as Parameters<typeof custom>[0]),
  });

  const [account] = await walletClient.requestAddresses();
  const chainId = await walletClient.getChainId();

  address.value = account;
  wrongNetwork.value = chainId !== chain.id;

  // Dynamic import to break the circular dependency (useMeute imports
  // useWallet for readOnlyContract/signMessage). Only here, never in
  // tryRestoreConnection(): membership verification asks for a signature,
  // it must never pop up silently on automatic reconnection at page load,
  // only on an explicit click on "Connect my wallet". This is also what
  // unlocks the whole governance page (members-only) — see useMeute.ts.
  const { verifyMembershipAndLoad } = await import("./useMeute").then((m) => m.useMeute());
  void verifyMembershipAndLoad(account);
}

// Without this, changing account or network *after* clicking "Connect"
// leaves the front stuck on its previous state (e.g. "wrong network" that
// never corrects itself) — MetaMask doesn't reload the page for us, its
// events have to be listened to explicitly.
let listenersAttached = false;
function attachWalletListeners() {
  if (listenersAttached) return;
  const injected = getInjected() as { on?: (event: string, cb: (...args: unknown[]) => void) => void } | undefined;
  if (!injected?.on) return;
  listenersAttached = true;

  injected.on("accountsChanged", (...args: unknown[]) => {
    const accounts = args[0] as string[];
    const newAccount = accounts.length > 0 ? (accounts[0] as Address) : null;
    address.value = newAccount;

    // The verified session/index (useMeute) related to the old account —
    // always clear it, whether disconnecting or switching to another
    // account, otherwise the page stayed displayed as if the new (or no)
    // account were still an authenticated member (observed: disconnecting
    // had no visible effect on the governance page).
    // Dynamic import: same reason as in connect() (useMeute <-> useWallet
    // circular dependency).
    void import("./useMeute").then((m) => {
      const { resetSession, verifyMembershipAndLoad } = m.useMeute();
      resetSession();
      // An explicit account change in MetaMask (not a silent reconnection
      // on load) — asking for a new proof of membership here is
      // consistent with "one signature per session", the session changes
      // with the account.
      if (newAccount) void verifyMembershipAndLoad(newAccount);
    });
  });

  injected.on("chainChanged", (...args: unknown[]) => {
    const chainIdHex = args[0] as string;
    wrongNetwork.value = parseInt(chainIdHex, 16) !== chain.id;
  });
}
attachWalletListeners();

// Without this, refreshing the page shows "connect my wallet" even if
// MetaMask already authorized this site — the authorization survives the
// reload on the wallet side, but `address` (a plain in-memory ref) resets
// to null on every module load. `getAddresses()` (eth_accounts) is
// silent, unlike `requestAddresses()` (eth_requestAccounts): it never asks
// for authorization again, just returns what was already granted.
async function tryRestoreConnection() {
  const injected = getInjected();
  if (!injected) return;
  try {
    const walletClient = createWalletClient({
      chain,
      transport: custom(injected as Parameters<typeof custom>[0]),
    });
    const [account] = await walletClient.getAddresses();
    if (!account) return;
    address.value = account;
    wrongNetwork.value = (await walletClient.getChainId()) !== chain.id;
  } catch {
    // Locked wallet or other silent issue — the user can always click
    // "Connect my wallet" manually.
  }
}
tryRestoreConnection();

/** Read-only (view) contract: works without a connected wallet. */
function readOnlyContract() {
  return getContract({ address: contractAddress, abi: CONTRACT_ABI, client: publicClient });
}

/** Signed contract: requires a connected wallet, for functions that write. */
function writableContract() {
  if (!address.value) throw new Error(i18n.global.t("errors.walletNotConnected"));
  const injected = (window as unknown as { ethereum: unknown }).ethereum;
  const walletClient = createWalletClient({
    account: address.value,
    chain,
    transport: custom(injected as Parameters<typeof custom>[0]),
  });
  return getContract({ address: contractAddress, abi: CONTRACT_ABI, client: walletClient });
}

/** Signs an arbitrary message (not a transaction) — used to prove
 *  ownership of a wallet without spending gas, e.g. unlinking a Discord
 *  account (see useDiscordLink.ts). */
async function signMessage(message: string): Promise<`0x${string}`> {
  if (!address.value) throw new Error(i18n.global.t("errors.walletNotConnected"));
  const injected = (window as unknown as { ethereum: unknown }).ethereum;
  const walletClient = createWalletClient({
    account: address.value,
    chain,
    transport: custom(injected as Parameters<typeof custom>[0]),
  });
  return walletClient.signMessage({ account: address.value, message });
}

export function useWallet() {
  return {
    address,
    wrongNetwork,
    noWalletDetected,
    connect,
    readOnlyContract,
    writableContract,
    signMessage,
    publicClient,
    contractAddress,
    syncLocalContractAddress,
  };
}
