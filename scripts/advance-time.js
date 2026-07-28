// Advances a local Hardhat node's (npx hardhat node) clock without having
// to wait for real time — useful to test a vote (7 days) or a probation
// (90 days) in one second. Only has an effect on a local simulator: these
// RPC commands (evm_increaseTime/evm_mine) don't exist on a real network
// like Sepolia.
//
// Usage: DURATION=7d node scripts/advance-time.js
//        (or via `npm run advance-time` — see package.json)
// Accepted formats: "7d", "12h", "30m", "3600" (raw seconds).

const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";

function parseDuration(input) {
  const match = /^(\d+)([dhms]?)$/.exec(input);
  if (!match) {
    throw new Error(`Invalid duration: "${input}" — valid examples: 7d, 12h, 30m, 3600`);
  }
  const value = Number(match[1]);
  const unit = match[2] || "s";
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * multipliers[unit];
}

async function rpc(method, params = []) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`${method} failed: ${body.error.message}`);
  return body.result;
}

async function main() {
  const raw = process.env.DURATION ?? "7d";
  const seconds = parseDuration(raw);

  await rpc("evm_increaseTime", [seconds]);
  await rpc("evm_mine", []);

  console.log(`Advanced time by ${seconds}s (${raw}) on ${RPC_URL}.`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  console.error("Is the local node (`npx hardhat node`) running on", RPC_URL, "?");
  process.exitCode = 1;
});
