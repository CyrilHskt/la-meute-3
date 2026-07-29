// tokens.ts reads DISCORD_STATE_SECRET at module load time (top-level
// `const STATE_SECRET = process.env.DISCORD_STATE_SECRET`), so it must be
// set before the module is imported — hence the dynamic import below
// instead of a static one.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DISCORD_STATE_SECRET = "test-secret";

const { createNonce, verifyNonce, createSession, verifySession } = await import("./tokens.js");

const WALLET = "0x1111111111111111111111111111111111111111";
const OTHER_WALLET = "0x2222222222222222222222222222222222222222";

function tamperSignature(token: string): string {
  const [payload, sig] = token.split(".");
  const flipped = sig[0] === "0" ? "1" : "0";
  return `${payload}.${flipped}${sig.slice(1)}`;
}

test("createNonce/verifyNonce round-trip succeeds for the same wallet and purpose", () => {
  const nonce = createNonce(WALLET, "membership");
  assert.equal(verifyNonce(nonce, WALLET, "membership"), true);
});

test("createSession/verifySession round-trip succeeds for the same wallet", () => {
  const session = createSession(WALLET);
  assert.equal(verifySession(session, WALLET), true);
});

test("verifyNonce rejects an expired nonce", async () => {
  const { createHmac } = await import("node:crypto");
  const payload = Buffer.from(JSON.stringify({ wallet: WALLET, purpose: "membership", ts: Date.now() - 6 * 60 * 1000 })).toString(
    "base64url",
  );
  const sig = createHmac("sha256", process.env.DISCORD_STATE_SECRET!).update(payload).digest("hex");
  const expiredNonce = `${payload}.${sig}`;
  assert.equal(verifyNonce(expiredNonce, WALLET, "membership"), false);
});

test("verifySession rejects an expired session", async () => {
  const { createHmac } = await import("node:crypto");
  const payload = Buffer.from(JSON.stringify({ wallet: WALLET, ts: Date.now() - 31 * 60 * 1000 })).toString("base64url");
  const sig = createHmac("sha256", process.env.DISCORD_STATE_SECRET!).update(payload).digest("hex");
  const expiredSession = `${payload}.${sig}`;
  assert.equal(verifySession(expiredSession, WALLET), false);
});

test("verifyNonce rejects a nonce verified against a different wallet", () => {
  const nonce = createNonce(WALLET, "membership");
  assert.equal(verifyNonce(nonce, OTHER_WALLET, "membership"), false);
});

test("verifySession rejects a session verified against a different wallet", () => {
  const session = createSession(WALLET);
  assert.equal(verifySession(session, OTHER_WALLET), false);
});

test("verifyNonce rejects a nonce created for a different purpose", () => {
  const membershipNonce = createNonce(WALLET, "membership");
  assert.equal(verifyNonce(membershipNonce, WALLET, "unlink"), false);

  const unlinkNonce = createNonce(WALLET, "unlink");
  assert.equal(verifyNonce(unlinkNonce, WALLET, "membership"), false);
});

test("verifyNonce rejects a nonce with a tampered signature", () => {
  const nonce = createNonce(WALLET, "membership");
  assert.equal(verifyNonce(tamperSignature(nonce), WALLET, "membership"), false);
});

test("verifySession rejects a session with a tampered signature", () => {
  const session = createSession(WALLET);
  assert.equal(verifySession(tamperSignature(session), WALLET), false);
});

test("verifyNonce/verifySession fail gracefully on malformed tokens", () => {
  assert.equal(verifyNonce("", WALLET, "membership"), false);
  assert.equal(verifySession("", WALLET), false);
  assert.equal(verifyNonce("garbage", WALLET, "membership"), false);
  assert.equal(verifySession("garbage", WALLET), false);
  assert.equal(verifyNonce("not-base64.not-hex", WALLET, "membership"), false);
  assert.equal(verifySession("no-delimiter-at-all", WALLET), false);
});
