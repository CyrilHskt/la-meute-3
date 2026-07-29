// discord-link.mts reads DISCORD_STATE_SECRET at module load time, so it
// must be set before the module is imported — hence the dynamic import
// below instead of a static one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

process.env.DISCORD_STATE_SECRET = "test-secret";
process.env.DISCORD_CLIENT_ID = "test-client-id";
process.env.DISCORD_CLIENT_SECRET = "test-client-secret";
process.env.DISCORD_GUILD_ID = "test-guild-id";

const { safeReturnTo, makeState, verifyState } = await import("../discord-link.mjs");

const ORIGIN = "https://lameute.example";
const WALLET = "0x1111111111111111111111111111111111111111";

test("safeReturnTo passes through a same-origin candidate unchanged", () => {
  const candidate = `${ORIGIN}/some/path?x=1`;
  assert.equal(safeReturnTo(candidate, ORIGIN), candidate);
});

test("safeReturnTo falls back to the origin root for a cross-origin candidate", () => {
  assert.equal(safeReturnTo("https://evil.example/phish", ORIGIN), `${ORIGIN}/`);
});

test("safeReturnTo falls back to the origin root for malformed input", () => {
  assert.equal(safeReturnTo("not a url", ORIGIN), `${ORIGIN}/`);
});

test("safeReturnTo falls back to the origin root for null input", () => {
  assert.equal(safeReturnTo(null, ORIGIN), `${ORIGIN}/`);
});

test("makeState/verifyState round-trip succeeds", () => {
  const state = makeState(WALLET, `${ORIGIN}/`);
  const verified = verifyState(state);
  assert.deepEqual(verified, { wallet: WALLET, returnTo: `${ORIGIN}/` });
});

test("verifyState rejects an expired state", () => {
  const payload = Buffer.from(
    JSON.stringify({ wallet: WALLET, returnTo: `${ORIGIN}/`, ts: Date.now() - 11 * 60 * 1000 }),
  ).toString("base64url");
  const sig = createHmac("sha256", process.env.DISCORD_STATE_SECRET!).update(payload).digest("hex");
  const expired = `${payload}.${sig}`;
  assert.equal(verifyState(expired), null);
});

test("verifyState rejects a tampered/forged signature", () => {
  const state = makeState(WALLET, `${ORIGIN}/`);
  const [payload, sig] = state.split(".");
  const flipped = sig[0] === "0" ? "1" : "0";
  assert.equal(verifyState(`${payload}.${flipped}${sig.slice(1)}`), null);
});

test("verifyState rejects a state signed with a different secret (forged elsewhere)", () => {
  const payload = Buffer.from(JSON.stringify({ wallet: WALLET, returnTo: `${ORIGIN}/`, ts: Date.now() })).toString(
    "base64url",
  );
  const forgedSig = createHmac("sha256", "some-other-secret").update(payload).digest("hex");
  assert.equal(verifyState(`${payload}.${forgedSig}`), null);
});

test("verifyState fails gracefully on malformed payloads", () => {
  assert.equal(verifyState(""), null);
  assert.equal(verifyState("garbage"), null);
  assert.equal(verifyState("no-delimiter-at-all"), null);
  const payload = Buffer.from("not json").toString("base64url");
  const sig = createHmac("sha256", process.env.DISCORD_STATE_SECRET!).update(payload).digest("hex");
  assert.equal(verifyState(`${payload}.${sig}`), null);
});
