import { ref } from "vue";
import type { Address } from "viem";
import { useWallet } from "./useWallet";

export interface DiscordLink {
  discordId: string;
  username: string;
  avatarUrl: string;
  linkedAt: string;
}

// Same principle as useMeute.ts: locally (demo panel), the source of truth
// is the demo server (demo/server.mjs), which runs the same real Discord
// OAuth flow as prod (see demo/server.mjs, a replica of
// netlify/functions/discord-link.mts) — just with a link stored in memory,
// reset on every scenario reset instead of in Netlify Blobs. DEV, not just
// VITE_CHAIN: see useMeute.ts for details.
const isLocal = import.meta.env.DEV && import.meta.env.VITE_CHAIN === "local";
const DEMO_SERVER_URL = "http://127.0.0.1:4100";
const UNLINK_URL = isLocal ? `${DEMO_SERVER_URL}/discord/unlink` : "/.netlify/functions/discord-link?action=unlink";
const NONCE_URL = isLocal ? `${DEMO_SERVER_URL}/discord/nonce` : "/.netlify/functions/dao-sync?key=discord-nonce";

// wallet (lowercase) → verified Discord identity. The whole governance
// page is reserved to current members (see useMeute.ts,
// isAuthorized/loadAll): this table is only populated after that
// verification, never by a direct fetch from this file.
const links = ref<Record<string, DiscordLink>>({});

/** Called by useMeute.ts once proof of membership is validated
 *  server-side — this file no longer makes any network request itself to
 *  populate this table, it only exposes the already-verified result. */
function setLinks(data: Record<string, DiscordLink>) {
  links.value = data;
}

function discordLinkFor(address: Address | null | undefined): DiscordLink | null {
  if (!address) return null;
  return links.value[address.toLowerCase()] ?? null;
}

// Address pending confirmation before heading to Discord — see
// DiscordConsentModal.vue. Without this screen, nothing told the member
// that once linked, their username and avatar become visible to other
// members, next to their votes/donations — a valid GDPR consent must be
// informed and specific, not just "one click on a button".
const pendingLinkAddress = ref<Address | null>(null);

/** Opens the consent screen — only heads to Discord after confirmation. */
function requestDiscordLink(address: Address) {
  pendingLinkAddress.value = address;
}
function cancelDiscordLink() {
  pendingLinkAddress.value = null;
}

/** Starts the Discord OAuth flow for this wallet — full-page redirect, the
 *  return happens via ?discord=linked|error|not_member on the URL. */
function confirmDiscordLink() {
  const address = pendingLinkAddress.value;
  if (!address) return;
  pendingLinkAddress.value = null;
  // Full URL (not just the origin): without this, the return from Discord
  // systematically redirected to the site root instead of the governance
  // page we started from — observed in testing.
  const returnTo = encodeURIComponent(window.location.href);
  if (isLocal) {
    window.location.href = `${DEMO_SERVER_URL}/discord/start?wallet=${address}&returnTo=${returnTo}`;
    return;
  }
  window.location.href = `/.netlify/functions/discord-link?action=start&wallet=${address}&returnTo=${returnTo}`;
}

/** To call once on page load to read and clean up the ?discord= parameter
 *  left by the OAuth callback. */
function consumeDiscordCallbackParam(): "linked" | "error" | "not_member" | null {
  const url = new URL(window.location.href);
  const result = url.searchParams.get("discord") as "linked" | "error" | "not_member" | null;
  if (!result) return null;
  url.searchParams.delete("discord");
  window.history.replaceState({}, "", url.toString());
  return result;
}

/** Unlinks a Discord account — wallet signature required (proves
 *  ownership without spending gas) rather than a plain HTTP request, so
 *  no one can ever unlink someone else's account. Answers the GDPR right
 *  to erasure: without this, a link once created was permanent. */
async function unlinkDiscord(address: Address) {
  const nonceRes = await fetch(`${NONCE_URL}${isLocal ? "?" : "&"}wallet=${address}&purpose=unlink`);
  if (!nonceRes.ok) throw new Error(await nonceRes.text());
  const { nonce } = (await nonceRes.json()) as { nonce: string };

  const { signMessage } = useWallet();
  const message = `Délier mon compte Discord de La Meute (${address}) — ${nonce}`;
  const signature = await signMessage(message);
  const res = await fetch(UNLINK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ wallet: address, signature, nonce }),
  });
  if (!res.ok) throw new Error(await res.text());
  const updated = { ...links.value };
  delete updated[address.toLowerCase()];
  links.value = updated;
}

export function useDiscordLink() {
  return {
    links,
    setLinks,
    discordLinkFor,
    pendingLinkAddress,
    requestDiscordLink,
    cancelDiscordLink,
    confirmDiscordLink,
    unlinkDiscord,
    consumeDiscordCallbackParam,
  };
}
