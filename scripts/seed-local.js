// Populates a freshly-deployed Meute contract on a local Hardhat node
// (npx hardhat node) with a varied state — to immediately have a contract
// with active/dormant Cubs/Wolves/votes/history/treasury to explore in
// the front, rather than replaying everything by hand via MetaMask. Rerun
// on every node restart (its state resets to zero every time).
//
// Mapping of `npx hardhat node` accounts (always the same addresses,
// fixed default mnemonic):
//   Account #0        -> active Wolf
//   Account #1        -> Cub (never confirmed)
//   Account #2        -> Applicant (open application, not voted on)
//   Account #3        -> Wolf made dormant
//   Account #4        -> Visitor (never touched, no card)
//   Account #6        -> Cub (never confirmed)
//   Account #7        -> Wolf made dormant
//   Account #8        -> Wolf made dormant
//   Account #9        -> active Wolf
//   Account #10       -> active Wolf
//   Account #11       -> Banned (admitted then excluded by vote — card
//                        burned, distinct from a voluntary resignation)
//   Account #12, #13, #14 -> admitted then resigned, just pad the treasury
//   (the Ignition module's founder, a separate address, stays an active Wolf)
//
// Final state: 4 active Wolves (founder + #0, #9, #10), 3 dormant Wolves
// (#3, #7, #8), 2 Cubs (#1, #6), 1 ongoing application (#2), 1 banned
// (#11), treasury > 0, an expense left open.
//
// Prerequisite: `npx hardhat node` in one terminal, then
//   npx hardhat ignition deploy ignition/modules/Meute.ts --network localhost
// in another, before running this script.
//
// Usage: node scripts/seed-local.js
// Optional env vars:
//   RPC_URL           (default http://127.0.0.1:8545)
//   CONTRACT_ADDRESS  (default: address of the very first Ignition
//                      deployment on a freshly started node, always the same)
//   FOUNDER           (default: the Ignition module's sole founder — must
//                      match what was actually deployed)
//
// To have Account #0..#13 in MetaMask without importing each private key
// separately by hand, two options:
//   - safest: copy each private key shown by `npx hardhat node` and
//     import them one by one (Import Account) — a bit longer, but doesn't
//     touch anything else in MetaMask;
//   - avoid importing Hardhat's default seed phrase as a new wallet: it's
//     public and reused by thousands of devs, MetaMask can then start
//     scanning and importing hundreds of unrelated accounts.

import { ethers } from "ethers";
import { loadAbi } from "./lib/abi.js";
import { DEFAULT_FOUNDER } from "./lib/constants.js";

const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS ?? "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const FOUNDER = process.env.FOUNDER ?? DEFAULT_FOUNDER;

const VoteChoice = { Approve: 0, Reject: 1, Postpone: 2 };
const DAY = 24 * 60 * 60;

async function advanceTime(provider, seconds) {
  await provider.send("evm_increaseTime", [seconds]);
  await provider.send("evm_mine", []);
}

/** Sends a tx that opens a proposal and returns its real proposalId, read
 *  from the emitted event — more robust than a hand-kept counter. */
async function openAndGetId(contract, txPromise) {
  const receipt = await (await txPromise).wait();
  for (const log of receipt.logs) {
    let parsed;
    try {
      parsed = contract.interface.parseLog(log);
    } catch {
      continue;
    }
    if (parsed?.name === "ProposalOpened") return parsed.args.proposalId;
  }
  throw new Error("ProposalOpened not found in the transaction logs.");
}

/** Takes an address from nothing to Wolf: application -> admission -> probation -> confirmation. */
async function becomeWolf(contracts, applicantAddr, voters) {
  const applicantContract = contracts.get(applicantAddr);
  const applicationId = await openAndGetId(
    applicantContract,
    applicantContract.applyForMembership({ value: contracts.fee }),
  );
  for (const v of voters) await (await contracts.get(v).vote(applicationId, VoteChoice.Approve)).wait();
  await advanceTime(contracts.provider, 7 * DAY + 1);
  await (await applicantContract.execute(applicationId)).wait();

  await advanceTime(contracts.provider, 90 * DAY + 1);
  const confirmationId = await openAndGetId(
    contracts.get(voters[0]),
    contracts.get(voters[0]).openConfirmationVote(applicantAddr),
  );
  for (const v of voters) await (await contracts.get(v).vote(confirmationId, VoteChoice.Approve)).wait();
  await advanceTime(contracts.provider, 7 * DAY + 1);
  await (await applicantContract.execute(confirmationId)).wait();
}

/** Makes an address apply and leaves the card at Cub rank, never confirming it. */
async function becomeCub(contracts, applicantAddr, voters) {
  const c = contracts.get(applicantAddr);
  const id = await openAndGetId(c, c.applyForMembership({ value: contracts.fee }));
  for (const v of voters) await (await contracts.get(v).vote(id, VoteChoice.Approve)).wait();
  await advanceTime(contracts.provider, 7 * DAY + 1);
  await (await c.execute(id)).wait();
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const abi = loadAbi(import.meta.url);

  await provider.send("hardhat_impersonateAccount", [FOUNDER]);
  await provider.send("hardhat_setBalance", [FOUNDER, "0x56BC75E2D63100000"]); // 100 ETH
  // provider.getSigner() checks the address against eth_accounts, which
  // never lists impersonated accounts — the signer has to be built
  // directly to bypass this check on ethers' side (the node itself does
  // accept transactions from this address).
  const founderSigner = new ethers.JsonRpcSigner(provider, ethers.getAddress(FOUNDER));

  const nodeAccounts = await provider.send("eth_accounts", []);
  if (nodeAccounts.length < 15) throw new Error("Not enough test accounts on the node (need at least 15).");

  const acc = (n) => nodeAccounts[n];
  const wolf0 = acc(0);
  const cub1 = acc(1);
  const applicant2 = acc(2);
  const dormant3 = acc(3);
  const visitor4 = acc(4);
  const cub6 = acc(6);
  const dormant7 = acc(7);
  const dormant8 = acc(8);
  const wolf9 = acc(9);
  const wolf10 = acc(10);
  const banned11 = acc(11);
  const boosters = [acc(12), acc(13), acc(14)];

  const usedAccounts = [
    wolf0,
    cub1,
    applicant2,
    dormant3,
    cub6,
    dormant7,
    dormant8,
    wolf9,
    wolf10,
    banned11,
    ...boosters,
  ];
  const signers = new Map();
  signers.set(FOUNDER.toLowerCase(), founderSigner);
  for (const addr of usedAccounts) signers.set(addr.toLowerCase(), await provider.getSigner(addr));

  const contracts = {
    provider,
    get(addr) {
      return new ethers.Contract(CONTRACT_ADDRESS, abi, signers.get(addr.toLowerCase()));
    },
  };
  const asFounder = contracts.get(FOUNDER);
  contracts.fee = await asFounder.fee();

  console.log(`Founder     (active Wolf) : ${FOUNDER}`);
  console.log(`Account #0  (active Wolf) : ${wolf0}`);
  console.log(`Account #1  (Cub)         : ${cub1}`);
  console.log(`Account #2  (Applicant)   : ${applicant2}`);
  console.log(`Account #3  (dormant Wolf): ${dormant3}`);
  console.log(`Account #4  (Visitor)     : ${visitor4}`);
  console.log(`Account #6  (Cub)         : ${cub6}`);
  console.log(`Account #7  (dormant Wolf): ${dormant7}`);
  console.log(`Account #8  (dormant Wolf): ${dormant8}`);
  console.log(`Account #9  (active Wolf) : ${wolf9}`);
  console.log(`Account #10 (active Wolf) : ${wolf10}`);
  console.log(`Account #11 (Banned)      : ${banned11}`);
  console.log("");

  console.log("1/8 — Account #0 joins the pack...");
  await becomeWolf(contracts, wolf0, [FOUNDER]);

  console.log("2/8 — Account #3 joins the pack (will become dormant)...");
  await becomeWolf(contracts, dormant3, [FOUNDER, wolf0]);

  console.log("3/8 — Account #7 joins the pack (will become dormant)...");
  await becomeWolf(contracts, dormant7, [FOUNDER, wolf0, dormant3]);

  console.log("4/8 — Account #8 joins the pack (will become dormant)...");
  await becomeWolf(contracts, dormant8, [FOUNDER, wolf0, dormant3, dormant7]);

  console.log("5/8 — Account #9 and #10 join the pack...");
  await becomeWolf(contracts, wolf9, [FOUNDER, wolf0, dormant3, dormant7, dormant8]);
  await becomeWolf(contracts, wolf10, [FOUNDER, wolf0, dormant3, dormant7, dormant8, wolf9]);

  // The majority threshold grows with the number of active Wolves
  // (snapshot frozen at opening): from here on we're all 7, so they all
  // have to vote to be sure of clearing the majority every time, rather
  // than a fixed subset that was enough at the start.
  const allWolves = [FOUNDER, wolf0, dormant3, dormant7, dormant8, wolf9, wolf10];

  console.log("6/8 — Account #1 and #6 apply and stay in probation (never confirmed)...");
  await becomeCub(contracts, cub1, allWolves);
  await becomeCub(contracts, cub6, allWolves);

  console.log("7/8 — Account #11 joins the pack then is excluded by vote (banned, not resigned)...");
  await becomeCub(contracts, banned11, allWolves);
  {
    const exclusionId = await openAndGetId(asFounder, asFounder.proposeExclusion(banned11));
    for (const v of allWolves) await (await contracts.get(v).vote(exclusionId, VoteChoice.Approve)).wait();
    await advanceTime(provider, 7 * DAY + 1);
    await (await asFounder.execute(exclusionId)).wait();
  }

  console.log("8/8 — Treasury: 3 applicants admitted then resigned (fee not refunded)...");
  for (const boosterAddr of boosters) {
    const c = contracts.get(boosterAddr);
    const id = await openAndGetId(c, c.applyForMembership({ value: contracts.fee }));
    for (const v of allWolves) await (await contracts.get(v).vote(id, VoteChoice.Approve)).wait();
    await advanceTime(provider, 7 * DAY + 1);
    await (await c.execute(id)).wait();
    await (await c.resign()).wait();
  }
  const treasury = await provider.getBalance(CONTRACT_ADDRESS);
  console.log(`   -> treasury: ${ethers.formatEther(treasury)} ETH.`);

  console.log("Making #3, #7 and #8 dormant (365d+ without acting), the others stay active...");
  await advanceTime(provider, 366 * DAY);
  for (const v of [FOUNDER, wolf0, wolf9, wolf10]) await (await contracts.get(v).imHere()).wait();

  console.log("Opening an application (#2) and an expense, left unvoted...");
  await (await contracts.get(applicant2).applyForMembership({ value: contracts.fee })).wait();
  await (
    await asFounder.proposeExpense(cub1, ethers.parseEther("0.01"), "Hébergement serveur de jeu")
  ).wait();

  console.log("");
  console.log("Done. Summary (Hardhat Local network in MetaMask):");
  console.log(`  Founder     (active Wolf) : ${FOUNDER} — your usual account, already funded.`);
  console.log(`  Account #0  (active Wolf) : ${wolf0}`);
  console.log(`  Account #1  (Cub)         : ${cub1}`);
  console.log(`  Account #2  (Applicant)   : ${applicant2}`);
  console.log(`  Account #3  (dormant Wolf): ${dormant3}`);
  console.log(`  Account #4  (Visitor)     : ${visitor4} — never touched, no card.`);
  console.log(`  Account #6  (Cub)         : ${cub6}`);
  console.log(`  Account #7  (dormant Wolf): ${dormant7}`);
  console.log(`  Account #8  (dormant Wolf): ${dormant8}`);
  console.log(`  Account #9  (active Wolf) : ${wolf9}`);
  console.log(`  Account #10 (active Wolf) : ${wolf10}`);
  console.log(`  Account #11 (Banned)      : ${banned11}`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  console.error(`Is the local node and the contract deployed at ${CONTRACT_ADDRESS} in place?`);
  process.exitCode = 1;
});
