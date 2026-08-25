# Design decisions

Why the contract is shaped the way it is. Each section records the decision,
the alternative that was rejected, and what the rejection cost.

Section numbers are stable: `contracts/Meute.sol` cites them from its NatSpec.

## 1. The problem being solved

A 25-year-old gaming association where turnout keeps falling and the president
has to chase members one by one to reach quorum. Two failures, which turn out
to be one: a quorum computed over *registered* members lets silence weigh as
much as opposition, and everything — the vote call, the treasury, the bylaws —
rests on a single person.

The scope stops at governance. Tournaments, sign-ups and rankings stay
off-chain; the loi 1901 legal shell remains. Only the mechanics move.

## 2. The membership card

A non-transferable ERC-721, one per member, carrying rank and last activity.
The card *is* the membership registry — there is no separate member list to
keep in sync with it.

The token id is the holder's address reinterpreted as an integer, never a
counter. An arbitrary id would have required a counter plus a mapping in each
direction, three things to keep consistent for no benefit. As a side effect,
`ownerOf` and `balanceOf` answer every membership question without an index.

## 3. Two-tier membership

Applicant → Cub (probation, 90 days) → Wolf (permanent). Drawn from the
association's actual practice rather than invented: newcomers are already
observed before being treated as full members.

Confirmation is a three-outcome vote — confirm, postpone, reject — because the
real-world decision has three outcomes. A binary vote would have forced an
undecided pack to reject someone it merely wanted more time to judge.

Postponement is capped at two. Without a cap, an indecisive pack could keep
someone in probation forever: a permanent second-class status nobody ever has
to own.

## 4. Passive dormancy

A Wolf with no activity for 180 days drops out of the quorum denominator. The
central mechanism of the project, and the one to understand first.

It is *passive*: no transaction marks a member dormant, no cron runs, no state
changes at the 180-day mark. `activeWolves()` recomputes the count on every
call by filtering on timestamps. The alternative — a maintained counter —
would need decrementing at an instant tied to no transaction, so somebody would
have to pay gas to observe the passage of time, and the counter could drift.

Dormancy is not a punishment. It costs nothing, removes no rank, and a single
vote reverses it. Absence is not refusal; it simply stops blocking everyone
else.

Six months rather than a year is an arithmetic choice, not an aesthetic one:
the quorum is 75% *of active Wolves*, so a longer delay means a larger active
group, and 75% within 7 days stops being reachable for an association that does
not vote weekly.

## 5. The frozen quorum snapshot

The quorum denominator is photographed when a proposal opens, not recomputed at
execution.

With a moving denominator, an attack is available: seeing a vote that targets
you approaching quorum, wake up ten dormant accomplices just before it closes.
The denominator grows, the votes already cast no longer suffice, quorum fails.
A moving denominator lets anyone kill any decision by inflating the electorate
after the fact.

Frozen, waking up during a vote can only add to the numerator. You can advance
a decision, never block one.

One edge case falls out of this: if the whole pack was dormant at opening, the
denominator would be zero and `cast × 4 > 0` would be true on the first vote,
letting a single voter carry everything. Rather than special-casing it, the
snapshot is left pending and taken at the first vote — after that voter wakes
up, so they become the denominator they just reconstituted. Two different
situations, one code path.

`imHere()` exists as the counterpart: it lets a dormant member become active
again *before* a proposal opens, which is the only way to be counted in a
denominator that will be frozen without them.

## 6. No board, no owner

After deployment the contract has no owner, no pause, no upgrade path, no
privileged role of any kind. The president holds no technical power.

The cost is real and assumed: a bug means a full redeployment. A proxy was
evaluated and rejected precisely because it reintroduces an admin — the single
point of failure the project exists to remove.

The only moment a card appears without a vote is the constructor minting the
founders', because the first member cannot be admitted by a vote of nobody.
Confining that to the constructor makes it a bootstrap rather than a capability.

## 7. One voting mechanic for four proposal types

Admission, confirmation, exclusion and expense share one cycle: open, seven
days, quorum, execute. Only execution consults the type.

Four separate mechanics would have meant four copies of the quorum arithmetic
to keep synchronised — four chances to diverge. The cost of sharing is a
`postponeVotes` counter that stays at zero on three types out of four.

The quorum itself is stored as a fraction rather than a percentage because
Solidity truncates integer division: `(cast / active) * 100 > 75` evaluates to
zero for any minority. Cross-multiplying — `cast × 4 > active × 3` — keeps the
comparison exact. The comparison is strict, so the threshold is *more than*
75%: with four active Wolves, three voters are exactly 75% and fail.

Passing also requires "yes" to strictly exceed "no" among votes cast. An
earlier version compared only "yes" against the snapshot, which let a single
voter carry an expense or an exclusion with no "no" vote able to stop it, even
if the rest of the pack woke up before closing.

## 8. Non-transferability, and the pitfall

The card must not move between holders, but it must still be mintable and
burnable.

The naive implementation blocks `_update` outright. OpenZeppelin routes mint
and burn through that same hook, so the contract becomes inert on deployment —
the constructor itself reverts. The correct condition is `from != 0 && to != 0`:
both ends exist, therefore it is a real transfer. If either is the zero
address, it is a creation or a destruction, and it is allowed.

Overriding `_update` rather than `transferFrom` is deliberate: `_update` is the
chokepoint every ownership change passes through, so one guard covers every
path, including ones added by future library versions. `approve` and
`setApprovalForAll` remain callable because ERC-721 mandates them, but they
authorise a transfer that is blocked downstream.

## 9. One contract, not two

The structural decision, and the one most likely to be challenged.

Splitting the card and the governance into two contracts is the textbook
answer: one responsibility each. It was rejected.

The governance reads the card on every action — the voter's rank, the target's
membership, the count of active Wolves. Across two contracts each of those is
an external call, which costs more gas. That is the minor objection.

The blocking one is access control. Two contracts means deciding who may mutate
the card, and the only workable answer is to make the governance contract the
owner of the card contract. That reintroduces a privileged role, in exactly the
place the specification demanded none. The "clean" architecture would have
recreated the single point of failure the project exists to eliminate.

In one contract, every mutation is a `private` function, unreachable from
outside. Access control becomes a property of the language rather than a
convention to enforce — and there is no admin to compromise, because there is
no admin.

## 10. Metadata entirely on-chain

The card's JSON and SVG are generated by the contract, Base64-encoded, with no
server and no IPFS pin.

A contract with no single point of failure whose cards point at a URL would
contradict itself: the day the server goes down or the pin expires, every card
becomes a grey square. The cost is bytecode size — the EIP-170 limit is 24 KB —
and compute on every `tokenURI` call. Acceptable for a simple drawing; it would
not scale to a complex illustration.

## 11. What stays off-chain, and why

Three things are deliberately not on-chain:

- **The proposal author**, kept only in the `ProposalOpened` event, to avoid one
  storage slot per proposal.
- **The donor leaderboard**, built from events. The contract keeps `O(1)`
  `totalDonations` per address and never loops over donors — the set of donors
  is unbounded, unlike the pack.
- **Discord identities**, because the chain cannot verify an OAuth response.
  Writing unverifiable data on-chain adds cost without adding trust.

The pattern is the same each time: put on-chain what needs to be trustless, and
derive the rest from what the chain already emits.
