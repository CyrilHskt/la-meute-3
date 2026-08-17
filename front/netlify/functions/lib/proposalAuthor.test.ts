// Guards the fix for the one real web2 hole found in the 2026-08 audit:
// ?key=patch-proposal used to copy the `author` field straight out of the
// browser's request body, so anyone could POST an arbitrary address and
// change the displayed author of any proposal until the next indexer pass.
// The author is now decoded from the transaction's own ProposalOpened log,
// which is what these tests exercise.
import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeEventTopics, type Hex } from "viem";
import { CONTRACT_ABI } from "../../../src/contract.js";
import { authorFromLogs, type EventLog } from "./proposalAuthor.js";

const CONTRACT = "0x71D5E89D8295B933c140332fa056609A8dad2218";
const AUTHOR = "0x1111111111111111111111111111111111111111";
const TARGET = "0x2222222222222222222222222222222222222222";
const ATTACKER = "0x3333333333333333333333333333333333333333";

/** ProposalOpened indexes proposalId, target and author, so every argument
 *  lands in a topic and `data` stays empty apart from the non-indexed
 *  proposalType — encodeEventTopics builds exactly what a node returns. */
function proposalOpenedLog(proposalId: bigint, author: string, address = CONTRACT): EventLog {
  const topics = encodeEventTopics({
    abi: CONTRACT_ABI,
    eventName: "ProposalOpened",
    args: { proposalId, target: TARGET as `0x${string}`, author: author as `0x${string}` },
  });
  return {
    address,
    // proposalType (uint8, non-indexed) = 0 (Admission).
    data: `0x${"0".repeat(64)}` as Hex,
    topics: topics as EventLog["topics"],
  };
}

const UNRELATED_LOG: EventLog = {
  address: CONTRACT,
  data: "0xdeadbeef",
  topics: [`0x${"ab".repeat(32)}` as Hex],
};

test("authorFromLogs returns the author announced by the matching ProposalOpened", () => {
  const logs = [proposalOpenedLog(7n, AUTHOR)];
  assert.equal(authorFromLogs(logs, "7", CONTRACT), AUTHOR);
});

test("authorFromLogs ignores logs emitted by another contract", () => {
  const logs = [proposalOpenedLog(7n, ATTACKER, "0x9999999999999999999999999999999999999999")];
  assert.equal(authorFromLogs(logs, "7", CONTRACT), null);
});

test("authorFromLogs ignores a ProposalOpened for a different proposal", () => {
  const logs = [proposalOpenedLog(8n, ATTACKER)];
  assert.equal(authorFromLogs(logs, "7", CONTRACT), null);
});

test("authorFromLogs returns null for a transaction that opened nothing (a vote, an execution)", () => {
  assert.equal(authorFromLogs([UNRELATED_LOG], "7", CONTRACT), null);
});

test("authorFromLogs skips undecodable logs and keeps looking", () => {
  const logs = [UNRELATED_LOG, proposalOpenedLog(7n, AUTHOR)];
  assert.equal(authorFromLogs(logs, "7", CONTRACT), AUTHOR);
});

test("authorFromLogs matches the contract address case-insensitively", () => {
  const logs = [proposalOpenedLog(7n, AUTHOR, CONTRACT.toLowerCase())];
  assert.equal(authorFromLogs(logs, "7", CONTRACT), AUTHOR);
});

test("authorFromLogs returns null on empty logs", () => {
  assert.equal(authorFromLogs([], "7", CONTRACT), null);
});
