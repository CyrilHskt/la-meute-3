// Self-verifying signed tokens (nonce + session) shared between dao-sync.mts
// (membership proof, session rereads) and discord-link.mts (unlink proof).
// Same principle as the OAuth `state` in discord-link.mts (HMAC, no
// storage), but a distinct token shape/purpose — kept separate from
// makeState/verifyState there.

import { createHmac, timingSafeEqual } from "node:crypto";

// Same secret as discord-link.mts's OAuth `state` — no new env var to add,
// same family of short-lived, server-signed tokens.
const STATE_SECRET = process.env.DISCORD_STATE_SECRET;

const NONCE_MAX_AGE_MS = 5 * 60 * 1000;
// Governance session duration: short enough that an excluded member
// quickly loses access, long enough not to ask for a signature again on
// every vote or tab change during a normal work session.
const SESSION_MAX_AGE_MS = 30 * 60 * 1000;

export type NoncePurpose = "membership" | "unlink";

function signer(payload: string): string {
  return createHmac("sha256", STATE_SECRET!).update(payload).digest("hex");
}

function createToken(data: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify({ ...data, ts: Date.now() })).toString("base64url");
  return `${payload}.${signer(payload)}`;
}

/** Verifies that a token (nonce or session) was indeed issued by us (HMAC
 *  signature), that it hasn't expired, and that it matches the wallet
 *  using it — without needing to store it anywhere (no Blobs for this,
 *  just a self-verifying signature, same principle as `state` in
 *  discord-link.mts). */
function verifyToken(token: string, wallet: string, maxAgeMs: number): Record<string, unknown> | false {
  const [payload, sig] = (token ?? "").split(".");
  if (!payload || !sig) return false;
  const expected = signer(payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { wallet: string; ts: number };
    if (Date.now() - data.ts > maxAgeMs) return false;
    if (data.wallet.toLowerCase() !== wallet.toLowerCase()) return false;
    return data;
  } catch {
    return false;
  }
}

export function createNonce(wallet: string, purpose: NoncePurpose): string {
  return createToken({ wallet, purpose });
}

export function verifyNonce(nonce: string, wallet: string, purpose: NoncePurpose): boolean {
  const data = verifyToken(nonce, wallet, NONCE_MAX_AGE_MS);
  if (!data) return false;
  return data.purpose === purpose;
}

export function createSession(wallet: string): string {
  return createToken({ wallet });
}

export function verifySession(session: string, wallet: string): boolean {
  return verifyToken(session, wallet, SESSION_MAX_AGE_MS) !== false;
}
