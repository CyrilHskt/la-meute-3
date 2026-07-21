// Avance l'horloge d'un nœud Hardhat local (npx hardhat node) sans avoir à
// attendre le temps réel — utile pour tester un vote (7 jours) ou une
// probation (90 jours) en une seconde. N'a d'effet que sur un simulateur
// local : ces commandes RPC (evm_increaseTime/evm_mine) n'existent pas sur
// un vrai réseau comme Sepolia.
//
// Usage : DURATION=7d node scripts/advance-time.js
//         (ou via `npm run advance-time` — voir package.json)
// Formats acceptés : "7d", "12h", "30m", "3600" (secondes brutes).

const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";

function parseDuration(input) {
  const match = /^(\d+)([dhms]?)$/.exec(input);
  if (!match) {
    throw new Error(`Durée invalide : "${input}" — exemples valides : 7d, 12h, 30m, 3600`);
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
  if (body.error) throw new Error(`${method} a échoué : ${body.error.message}`);
  return body.result;
}

async function main() {
  const raw = process.env.DURATION ?? "7d";
  const seconds = parseDuration(raw);

  await rpc("evm_increaseTime", [seconds]);
  await rpc("evm_mine", []);

  console.log(`Temps avancé de ${seconds}s (${raw}) sur ${RPC_URL}.`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  console.error("Le nœud local (`npx hardhat node`) tourne-t-il bien sur", RPC_URL, "?");
  process.exitCode = 1;
});
