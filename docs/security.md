# Security model

What this contract defends against, how, and what it deliberately does not.
Each on-chain claim below is exercised by the test suite (`test/Meute.ts`).

## The starting point: nothing to compromise

After deployment there is no owner, no pause, no upgrade, no privileged role.
There is no admin key to steal, phish or lose. Every guard is a rank verified
on-chain, not an address on a list.

This removes a whole class of attacks and adds one accepted weakness: a bug
cannot be patched, only redeployed. That trade is the point of the project, not
an oversight.

## Reentrancy — defended twice

Two external calls exist: refunding a rejected applicant's fee, and paying an
approved expense. Both are reachable only from `execute`.

- **Checks-effects-interactions.** `prop.executed = true` is written before any
  transfer. A malicious beneficiary re-entering `execute` from its `receive()`
  finds the proposal already executed and is rejected with `AlreadyExecuted`.
- **`nonReentrant`.** A global lock that still holds if a future refactor
  breaks the CEI ordering by accident.

This is demonstrated rather than asserted: `contracts/test/ReentrantExpenseBeneficiary.sol`
is a real attacking contract that attempts the re-entry, and the test asserts
it fails.

`.call{value:}` is used rather than `.transfer()`. The 2300-gas stipend
`transfer` imposes was itself an anti-reentrancy measure, but repricing
(EIP-1884) turned it into a hazard: a legitimate multisig or smart wallet can
exceed it and make a valid payment fail. The stipend is not needed here because
the two defences above are.

The return value is checked. `.call` does not revert on failure, it returns
`false` — ignoring it would mark an expense executed and approved while the ETH
never left.

## Denial of service by gas limit

`activeWolves()` iterates the set of Wolves. This is the one open risk, and it
should be stated plainly rather than defended away.

Why it is bounded in practice: becoming a Wolf requires an application, 90 days
of probation and a 75% confirmation vote. An attacker cannot inflate the set,
unlike the textbook case of an array anyone can append to. Growth is that of a
real association — tens of members.

Why it still matters: the loop is free when called externally, but not when
called inside a transaction, which happens on every proposal opening and on the
first vote after a deferred snapshot.

The mitigation is `pruneDormant(address)`: permissionless, it removes a
verified-dormant Wolf from the iterated set. It is safe to expose to anyone
because it verifies dormancy on-chain and touches neither rank, card nor voting
eligibility — a dormant Wolf was neither counted nor able to vote anyway.

**This mitigates the risk, it does not remove it.** The set can grow between
purges and nobody is obliged to call the function.

Pruning does not disenfranchise: `_wakeUp` reinserts a member into the set when
they return. That line exists precisely because `pruneDormant` does — without
it, a purge would silently become an exclusion.

## Denial of service by unexpected revert

A beneficiary whose `receive()` reverts makes the whole execution fail, leaving
the expense neither executed nor executable. This is a known limitation, tested
explicitly (`contracts/test/RejectEther.sol`).

A pull-payment pattern — the beneficiary collects the funds themselves — would
avoid it, at the cost of an extra step for every legitimate recipient. Accepted
as-is for an association prototype.

## Force feeding

ETH can be forced into any contract via `selfdestruct` or a pre-computed
CREATE2 address. No contract can prevent it.

The defence is not to block the entrance but never to make an invariant depend
on the balance. Quorum is computed from a *count* of Wolves; `address(this).balance`
is read in exactly one place, to check that a voted expense is payable. Excess
balance therefore breaks nothing — it simply enlarges the treasury.

Note also that there is no `receive()` and no `fallback()`: an ordinary ETH
transfer to the contract fails. Donations go through `donate()`, which makes
them intentional, traceable and attributable.

## Front-running

The relevant vector is the quorum denominator, addressed by freezing the
snapshot at proposal opening — see design decision §5. Without it, waking
dormant accounts just before a vote closes would let anyone defeat any
proposal.

## Timestamp manipulation

All delays are measured in days: 7 for a vote, 90 for probation, 180 for
dormancy. The few seconds of drift a validator can introduce are irrelevant at
that scale, so no defence is needed beyond not using timestamps for anything
finer.

## Arithmetic

Solidity 0.8.x reverts on overflow, so no SafeMath. Two places still needed
care:

- The quorum comparison widens to `uint256` **before** multiplying. `uint32 × uint8`
  is promoted only to `uint32`, so the product could overflow and revert —
  not a theft, but a proposal that can never execute.
- The postponement counter saturates rather than incrementing freely, because
  the passive postponement outcome can repeat indefinitely and a wrapped
  `uint8` would hand active postponements back to a Cub who had exhausted them.

## The web layer

The site is not part of the trust model — governance truth is on-chain and
every write goes through the user's wallet — but it holds two surfaces worth
auditing.

**The public patch endpoint.** `?key=patch-proposal` takes no secret, so it is
built so the browser cannot assert anything: it supplies a proposal id and its
own transaction hash, and the server derives every stored field itself,
rereading the proposal on-chain and decoding the author from the
`ProposalOpened` log of that receipt. An earlier version copied the author
straight from the request body, which let anyone change the displayed author of
any proposal until the next indexer pass. A rate limit of one patch per
proposal per 10 seconds bounds RPC-read abuse.

**Membership proof.** Signature over a short-lived, purpose-bound nonce, plus a
live on-chain balance check on every initial call — never cached, so a member
excluded a minute ago cannot obtain a session. Sessions last 30 minutes; the
accepted trade-off is that a member excluded mid-session keeps read access until
it expires.

Nonces and sessions are self-verifying HMAC tokens, stored nowhere. They are
**short-lived, not single-use**: nothing consumes them, so a token and the
signature over it stay replayable for their TTL. No exploit follows — replaying
a membership proof only opens a session for a wallet the replayer already
controls, and replaying an unlink is idempotent — but the property should be
stated accurately rather than overclaimed.

**Secrets.** `DISCORD_CLIENT_SECRET`, `SYNC_SECRET`, `DISCORD_STATE_SECRET` and
the RPC key live in Netlify environment variables and GitHub Secrets, never in
the repository. The browser-side RPC URL is exposed by design: it is read-only,
authorises no transaction, and can be domain-restricted at the provider.

**OAuth.** The Discord `state` parameter is signed (CSRF), and `returnTo` is
bounded to the same origin, closing the classic open-redirect. Unlinking
requires a wallet signature, which is what makes erasure a member's own right
rather than an administrator's favour.

## Known limitations, stated deliberately

- The `activeWolves` loop is mitigated, not eliminated.
- A beneficiary that rejects ETH blocks its own expense.
- Anyone can open proposals from many addresses. Each costs gas and locks a fee
  for seven days, and there is no on-chain loop over proposals, so the chain is
  unaffected — but the off-chain indexer rereads every proposal on each pass.
- A member excluded mid-session retains read access for up to 30 minutes.
- The snapshot a visitor reads can be up to 30 minutes old; anything about
  themselves is read live instead.
