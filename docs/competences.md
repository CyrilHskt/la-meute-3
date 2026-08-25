# Where each certification competency is demonstrated

A reading key for this repository: for each competency, what was built and
which files carry the evidence.

Competency labels follow the RS6515 breakdown used throughout the project's
design notes.

## C1 — Specification

The specification is delivered as a separate document. It defines the actors
and states, the state machine, the governance rules section by section
(§7.0 to §7.6bis), the parameters, and the assumed limitations.

`contracts/Meute.sol` cites its section numbers directly from NatSpec, so the
code and the specification can be read side by side.

## C2 — Smart contract

**`contracts/Meute.sol`** — 772 lines, Solidity 0.8.28, pinned (not `^`) so the
build is reproducible and the deployed bytecode verifiable.

One contract holds both the membership registry and the governance mechanics;
the reasoning, including the two-contract alternative that was rejected, is in
[recap-conception.md §9](recap-conception.md). No owner, no pause, no upgrade
path after deployment.

Notable mechanics: passive dormancy, a quorum denominator frozen at proposal
opening, a single voting cycle shared by four proposal types, and a
three-outcome confirmation vote whose default is the outcome that harms nobody.

## C3 — Token justification

The membership card is a non-transferable ERC-721. Why a token rather than a
mapping, and why non-transferable, is in
[recap-conception.md §2 and §8](recap-conception.md).

In short: the card *is* the registry, so there is no member list to keep in
sync with it; and it must not be sellable, because a transferable membership
card would make voting rights tradable.

Non-transferability is enforced in `_update` — the chokepoint every ownership
change passes through — while still allowing mint and burn. The pitfall that
makes this non-obvious is documented in the same section.

## C4 — Security

**[security.md](security.md)** — the threat model: reentrancy, DoS by gas limit,
DoS by unexpected revert, force feeding, front-running, timestamp manipulation,
arithmetic, plus the web layer's own surfaces.

Reentrancy is not merely asserted: `contracts/test/ReentrantExpenseBeneficiary.sol`
is a real attacking contract that attempts the re-entry from its `receive()`,
and the suite asserts it fails. `contracts/test/RejectEther.sol` covers the
recipient-refuses-payment case.

Known limitations are stated explicitly rather than omitted — in particular
that the unbounded-loop risk is *mitigated* by `pruneDormant`, not eliminated.

## C5 — Versioning and CI

Two independent version tracks, because a CSS change has no reason to bump a
contract version:

| Workflow | Role |
|---|---|
| `ci.yml` | On every push and pull request: contract tests, front build, function typecheck and tests |
| `version-check.yml` | On a `contract-v*` tag: cross-checks the tag against the `VERSION` constant inside the deployed contract |
| `release-contract.yml` | Manual: bumps `VERSION` in `Meute.sol`, commits, tags `contract-vX.Y.Z` |
| `release-front.yml` | Manual: bumps `front/package.json`, commits, tags `front-vA.B.C` |
| `sync-dao.yml` | Every 30 minutes: runs the indexer against the production chain |

`scripts/check-contract-sync.js` runs in CI and compares the front's committed
ABI against the freshly compiled contract, so the front cannot silently drift
from the contract it talks to.

## C6 — Functional tests

**`test/Meute.ts`** — 73 tests, TypeScript, run with `npx hardhat test`.

They are end-to-end scenarios rather than unit tests, because the behaviour
worth proving involves time and several accounts: a 90-day probation, a 180-day
dormancy, a quorum that changes as members fall dormant. Time advancement uses
`networkHelpers`.

`contracts/test/` holds helper contracts used *by* these tests, not `*.t.sol`
unit tests.

The web layer has its own suite: 26 tests via `npm run test:functions` in
`front/`, covering the signed-token logic and the server-side derivation of a
proposal's author.

## C7 — Web front-end

**`front/`** — Vue 3, Vite, TypeScript, `viem`.

Writes always go through the connected wallet; there is no privileged backend
path to the contract. Reads come from a snapshot maintained by the indexer, so
no visitor scans the chain themselves — the reasoning, and the free-RPC limits
that forced it, are in [architecture.md](architecture.md).

Also included: French/English localisation, an explicit dark mode, and a local
demo mode (`npm run demo`) that replays scripted governance scenarios against a
Hardhat node with time travel — a 180-day dormancy delay is not something a
live testnet lets you demonstrate.

## C8 — Public deployment

Deployed with Hardhat Ignition. Deployment journals for both chains are
committed under `ignition/deployments/`.

| Chain | Id | Address | Role |
|---|---|---|---|
| Base Sepolia | 84532 | `0x71D5E89D8295B933c140332fa056609A8dad2218` | Production since 2026-08-03 |
| Sepolia | 11155111 | `0x528d68AFE81572c26f213de4Aa3e9B94578bDa3E` | Original L1 deployment, kept as rollback |

The current source compiles to exactly the bytecode deployed on both chains —
the metadata hash embedded in the deployed bytecode matches a fresh local
compile, which is what makes source verification meaningful rather than
decorative.

The migration from L1 Sepolia to the Base L2 was a cost decision, measured
rather than assumed; the front, the Netlify functions and the indexer all
select their chain from configuration, so a rollback is an environment variable
rather than a code change.
