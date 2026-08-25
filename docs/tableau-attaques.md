# Table of known attacks

Every documented attack on the technology in use — Solidity and the EVM for the
chain, plus the application surface around the contract — with what protects
*this* application, the evidence for it, and what risk remains.

Three statuses: **Neutralised** (an explicit, tested defence exists) ·
**Mitigated** (the risk is reduced, not removed) · **Not applicable** (the
vulnerable pattern does not exist in this code).

---

## 1. Attacks on the contract

| Attack | Status | What protects La Meute 3.0 | Evidence |
|---|---|---|---|
| **Reentrancy** — the recipient of a transfer calls back before execution finishes | Neutralised | Two defences stacked: `prop.executed = true` written **before** any external call (checks-effects-interactions), and OpenZeppelin's `nonReentrant`. The only two external calls (`_refund`, `_executeExpense`) both originate in `execute()` | `ReentrantExpenseBeneficiary.sol` — a real attacking contract that re-enters from its `receive()`; the suite asserts it fails |
| **Read-only reentrancy** — reading inconsistent state during an external call | Not applicable | No view is consulted by a third party mid-call: transfers are the last operation, after state is written | `execute()` |
| **DoS by gas limit** — looping over an unbounded structure | **Mitigated** | `activeWolves()` iterates `_wolves`. Its size is not attacker-controlled (becoming a Wolf takes an application, 90 days of probation and a 75% vote), and `pruneDormant()` is permissionless, so anyone can remove a verified-dormant member | `pruneDormant` tests; risk documented in [security.md](security.md) |
| **DoS by unexpected revert** — a recipient refusing funds blocks processing | **Mitigated** | Each proposal is handled on its own: a beneficiary refusing ETH blocks only **its** expense, never anyone else's. No batch processing | `RejectEther.sol` |
| **Force feeding** — ETH pushed in via `selfdestruct` or a precomputed `CREATE2` address | Neutralised by design | No invariant depends on the balance. Quorum is computed from a *count* of Wolves; `address(this).balance` is read in exactly one place, to check a voted expense is payable | `_quorumReached`, `_executeExpense` |
| **Ignored external call return value** | Neutralised | `.call{value:}` returns `false` rather than reverting: the value is checked and `TransferFailed` raised | `_refund`, `_executeExpense` |
| **Arithmetic overflow / underflow** | Neutralised | Solidity 0.8.x reverts natively. Two places hardened further: widening to `uint256` **before** multiplying in the quorum check, and saturating the postponement counter — a wrapped `uint8` would hand postponements back to a Cub who had exhausted them | `_quorumReached`, `_executeConfirmation` |
| **Missing or over-broad access control** | Neutralised | No privileged role exists after deployment, so there is no key to steal. Every mutating function carries its rank guard, verified on-chain | Per-function tests; absence of `owner` / `pause` / `upgrade` |
| **Front-running / MEV** — watching the mempool to get ahead of a transaction | Neutralised on the relevant vector | The quorum denominator is **frozen at proposal opening**. Without that, waking dormant accomplices just before closing would defeat any proposal by inflating the electorate | `activeSnapshot` / `snapshotFrozen`; dormancy tests |
| **`block.timestamp` dependence** | Not applicable in practice | Delays are measured in days (7 / 90 / 180); a validator's manipulation window is seconds | `VOTE_DURATION`, `PROBATION_DURATION`, `DORMANCY_DELAY` |
| **Spam / griefing** — flooding the contract with proposals | **Mitigated** | One open application per address, and each locks the fee for seven days. No on-chain loop over proposals, so the chain is unaffected | `_applicationOpen`; off-chain limit documented |
| **Double voting** | Neutralised | `_hasVoted[proposalId][voter]` registry | Voting tests |
| **Voting on your own case** (conflict of interest) | Neutralised | The target of an exclusion or an expense cannot vote, and is removed from the denominator so the quorum does not become unreachable | `ConflictOfInterest`, `_activeForQuorum` |
| **Censorship by inaction** — nobody executes a passed vote | Neutralised | `execute()` is open to anyone, member or not, so whoever benefits from a decision can trigger it | `execute()` carries no rank guard |
| **A decision carried by a single voter** | Neutralised | A real bug found in review: an earlier version compared only "yes" against the snapshot. Fixed by requiring **participation quorum AND strict majority** | `_isPassed` |
| **`tx.origin` phishing** | Not applicable | `tx.origin` appears nowhere; every check uses `msg.sender` | No occurrence in source |
| **Storage collision / `delegatecall`** | Not applicable | No proxy, no `delegatecall`, no upgradeability — a deliberate choice | No occurrence |
| **Bad randomness** | Not applicable | The contract draws no randomness | No occurrence |
| **Unwanted token transfer** | Neutralised | The card is non-transferable: `_update` blocks holder-to-holder transfer while allowing mint and burn | Non-transferability tests |

---

## 2. Critical analysis of user interactions

A correct contract does not make an application safe: anything that **writes
what users read** is part of the surface. This section applies the table above
to the real interactions.

| Interaction | Attack considered | Status | What protects it |
|---|---|---|---|
| Refreshing the snapshot after a transaction (`?key=patch-proposal`, public endpoint) | Injecting made-up data from the browser | **Real vulnerability, found and fixed** | The endpoint copied `author` straight from the request body, so anyone could change the displayed author of any proposal until the next indexer pass. The client now sends only the proposal id and the hash of **its own** transaction; the server rereads the proposal on-chain and decodes the author from the `ProposalOpened` log of that receipt, checking the id matches. The worst case becomes an unknown author, not a forged one |
| Proving membership to read governance | Replaying a captured signature | **Mitigated, accepted** | The nonce is signed, timestamped, bound to the wallet and to one purpose, valid 5 minutes — but stored nowhere, therefore **not consumed**: replayable within its lifetime. Harmless, since replaying only opens a session for a wallet the attacker already controls |
| Staying signed in without re-signing | Keeping access after exclusion | **Mitigated, accepted** | The card balance is verified **on-chain on every initial request**, never from a cache, so an excluded member cannot obtain a session. Accepted trade-off: a session already issued stays valid for up to 30 minutes |
| Linking a Discord account (OAuth2) | CSRF on the authorisation callback | Neutralised | The `state` parameter is signed and verified on return |
| Returning to the site after OAuth | Open redirect | Neutralised | `returnTo` is bounded to the same origin; anything external falls back to the root |
| Unlinking a Discord account | Unlinking someone else's | Neutralised | Requires a signature from the wallet concerned — which is what makes the erasure right the member's own rather than an administrator's favour |
| Hammering the public endpoint | Exhausting the RPC quota | **Mitigated** | One patch per proposal per 10 seconds, the counter itself stored and purged of expired entries |
| Reading the snapshot without being a member | Accessing governance data | Neutralised | The snapshot is served only against a valid session, itself backed by a signature and a balance check |
| Any write from the interface | A server acting on the user's behalf | Not applicable by design | No write passes through a server: every state change is a wallet-signed transaction |

---

## 3. What remains open

Stated deliberately rather than omitted:

- The `activeWolves()` loop is **mitigated** by `pruneDormant`, not removed: the set can grow between purges and nobody is obliged to call it.
- A beneficiary whose `receive()` reverts blocks its own expense. A pull-payment pattern would avoid it, at the cost of an extra step for every legitimate beneficiary.
- N proposals opened from N addresses remain possible. The chain does not suffer; the off-chain indexer rereads every proposal on each pass.
- A session already issued outlives an exclusion by up to 30 minutes.
- The contract is not upgradeable, so none of these can be fixed except by redeploying — the accepted price of having no privileged role.
