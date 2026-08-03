import { ref } from "vue";
import { createPublicClient, createWalletClient, custom, http, getContract, type Address, type Chain } from "viem";
import { sepolia, hardhat, baseSepolia } from "viem/chains";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../contract";
// Direct `i18n.global.t` rather than the `useI18n()` composable: these
// guards live in plain module-level functions (the singleton pattern used
// throughout this file), not inside a component's setup(), where
// `useI18n()` requires an active injection context.
import { i18n } from "../i18n";
import { isLocal, remoteChainMode } from "./chainMode";

// Target network: Sepolia by default (the real, committed deployment), the
// local Hardhat node to test the whole cycle in a few seconds (time
// advancement via networkHelpers) instead of real days, or Base Sepolia
// once VITE_CHAIN=l2 is actually turned on (not yet — see chainMode.ts).
// Configured via front/.env.local (never committed, see *.local in
// .gitignore) — never touches contract.ts, which stays the source of
// truth for the Sepolia deployment.
const chain: Chain = isLocal ? hardhat : remoteChainMode === "l2" ? baseSepolia : sepolia;
// Locally, the address isn't fixed: the demo panel (demo/server.mjs)
// redeploys a brand-new contract on every reset, so a new address every
// time. A ref so it can be refreshed without restarting the dev server —
// see syncLocalContractAddress.
const contractAddress = ref<Address>(
  (import.meta.env.VITE_CONTRACT_ADDRESS as Address | undefined) ?? CONTRACT_ADDRESS,
);

const DEMO_SERVER_URL = "http://127.0.0.1:4100";

async function fetchLocalContractAddress() {
  if (!isLocal) return;
  try {
    const res = await fetch(`${DEMO_SERVER_URL}/api/state`);
    if (!res.ok) return;
    const data = (await res.json()) as { contractAddress?: Address | null };
    if (data.contractAddress) contractAddress.value = data.contractAddress;
  } catch {
    // The demo panel might not be running — not blocking, we keep the last
    // known address.
  }
}

// Only the *first* sync is memoized: callers that merely need the address
// to be resolved once (ensureContractAddressSynced) must not pay for a
// fetch each time, whereas syncLocalContractAddress() genuinely re-reads
// on every snapshot load — the demo panel redeploys a brand-new contract
// on every scenario reset.
let firstAddressSync: Promise<void> | null = null;

/** Fetches the current address from the demo panel. No effect outside
 *  local mode — never called (or even reachable) in prod. */
function syncLocalContractAddress(): Promise<void> {
  const sync = fetchLocalContractAddress();
  firstAddressSync ??= sync;
  return sync;
}

/** Awaited before any contract read whose result would be wrong against
 *  the pre-sync (env-provided) address — in local demo mode the address in
 *  VITE_CONTRACT_ADDRESS is stale as soon as the panel redeploys. Resolves
 *  immediately outside local mode: the Sepolia address is a compile-time
 *  constant, there is nothing to resolve. */
function ensureContractAddressSynced(): Promise<void> {
  if (!isLocal) return Promise.resolve();
  return (firstAddressSync ??= fetchLocalContractAddress());
}
const address = ref<Address | null>(null);
const wrongNetwork = ref(false);
const noWalletDetected = ref(false);

// Listener registries to break the circular dependency with useMeute.ts
// (which imports useWallet for readOnlyContract/signMessage): rather than
// useWallet importing useMeute back, useMeute registers itself here (see
// main.ts) and useWallet notifies it through these callbacks.
const explicitConnectListeners: ((addr: Address) => void)[] = [];
const accountLostOrChangedListeners: ((addr: Address | null) => void)[] = [];

function onExplicitConnect(cb: (addr: Address) => void) {
  explicitConnectListeners.push(cb);
}
function onAccountChanged(cb: (addr: Address | null) => void) {
  accountLostOrChangedListeners.push(cb);
}

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

  // Notify listeners (see useMeute.ts, wired in main.ts) rather than
  // importing useMeute directly, to break the circular dependency. Only
  // here, never in tryRestoreConnection(): membership verification asks
  // for a signature, it must never pop up silently on automatic
  // reconnection at page load, only on an explicit click on "Connect my
  // wallet". This is also what unlocks the whole governance page
  // (members-only) — see useMeute.ts.
  explicitConnectListeners.forEach((cb) => cb(account));
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

    // Notify listeners (see useMeute.ts, wired in main.ts) rather than
    // importing useMeute directly — same reason as in connect() (breaking
    // the useMeute <-> useWallet circular dependency). The verified
    // session/index related to the old account must always be cleared,
    // whether disconnecting or switching to another account, otherwise the
    // page stayed displayed as if the new (or no) account were still an
    // authenticated member (observed: disconnecting had no visible effect
    // on the governance page).
    accountLostOrChangedListeners.forEach((cb) => cb(newAccount));
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
const restoreConnectionPromise = tryRestoreConnection();

/** Read-only (view) contract: works without a connected wallet. */
function readOnlyContract() {
  return getContract({ address: contractAddress.value, abi: CONTRACT_ABI, client: publicClient });
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
  return getContract({ address: contractAddress.value, abi: CONTRACT_ABI, client: walletClient });
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
    ensureContractAddressSynced,
    onExplicitConnect,
    onAccountChanged,
    restoreConnectionPromise,
    isLocal,
  };
}
