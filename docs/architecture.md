# Architecture

Three layers, one source of truth. The chain holds the governance state; an
indexer turns its event log into a snapshot; the front reads that snapshot
instead of scanning the chain itself.

```
   wallet (MetaMask)                        browser
        │                                      │
        │ signs transactions                   │ reads
        ▼                                      ▼
 ┌─────────────────┐   events   ┌──────────┐   ┌────────────────────┐
 │  Meute.sol      │ ─────────▶ │ indexer  │──▶│  Netlify Blobs     │
 │  (Base Sepolia) │            │ (cron)   │   │  index / state     │
 └─────────────────┘            └──────────┘   └────────────────────┘
        ▲                                              │
        │  reads "about me" live (balance, card)       │ served by
        └──────────────────────────────────────────────┤ Netlify Functions
                                                       ▼
                                                  Vue 3 front
```

## Why an indexer exists at all

The obvious design is to let the browser read the chain directly. It does not
survive contact with a free RPC plan: `eth_getLogs` is capped at 10 blocks per
request, throughput is low enough to return 429 on sequential calls, and the
cost grows with both traffic and history. Every visitor rescanning the whole
contract history on every page load is the worst possible shape for that.

So the scan happens once, centrally, on a schedule — and every visitor
downloads the result. The indexer (`scripts/sync-dao.js`) runs every 30 minutes
as a GitHub Actions cron, walks the new blocks since its last cursor, and
publishes a JSON snapshot.

Two consequences worth knowing:

- **The snapshot can be up to 30 minutes stale.** Anything a member does is
  patched in immediately (see below), so in practice only global statistics
  lag.
- **"About me" data is never taken from the snapshot.** Balance, card, rank and
  personal donation total are read live from the contract, because being told
  by a cache that you are still a member is not the same as being one.

## The two write paths

Nothing writes governance data except the chain. But the *snapshot* has two
writers:

1. **The indexer**, on its schedule, authenticated by a shared secret
   (`x-sync-secret`).
2. **The front, right after a transaction it just mined** — the
   `?key=patch-proposal` endpoint. This exists so a vote is visible to other
   members immediately rather than at the next cron pass.

That second path is public, which makes it the most security-sensitive surface
of the web layer. It is deliberately built so the browser cannot assert
anything: it sends a proposal id and the hash of its own transaction, and the
function derives every stored field itself — the proposal is reread on-chain,
and the author is decoded from the `ProposalOpened` log of that receipt (see
`netlify/functions/lib/proposalAuthor.ts`). A forged request can at worst leave
an author unknown until the next indexer pass; it cannot forge one.

## Why the author needs decoding at all

The proposal author is not in the on-chain `Proposal` struct — only in the
`ProposalOpened` event. That is a storage decision (one address per proposal is
one more slot), and it is the reason a whole mechanism exists off-chain: the
indexer rebuilds the author table from logs, and the patch endpoint reads a
transaction receipt. It cannot simply reread the author like every other field.

## Members-only reads

The governance snapshot is not public, even though the underlying data is
on-chain. The reasoning is in the de-anonymisation discussion: publishing a
browsable table of members, their activity and their Discord identities on a
public website is a different act from having the same facts scattered across
an event log.

Access works in two steps:

1. The wallet signs a message containing a short-lived, purpose-bound nonce.
   The server verifies the signature **and the card balance live on-chain** — a
   member excluded a minute ago cannot obtain a session.
2. That proves membership once and issues a 30-minute session token, so a page
   refresh does not ask for a new signature.

Both nonce and session are self-verifying HMAC tokens
(`netlify/functions/lib/tokens.ts`) — signed, short-lived, stored nowhere.
They are explicitly *not* single-use: nothing consumes them, so a token stays
replayable for its TTL. That is an accepted trade-off, since every use is
already bound to a wallet whose signature the replayer had to obtain.

## Discord identity stays off-chain

Linking a Discord account is an OAuth2 flow handled by
`netlify/functions/discord-link.mts`, stored in Netlify Blobs. It is not
on-chain on purpose: the chain cannot verify an OAuth response, so writing one
into storage would add cost without adding trust. Unlinking is proved by wallet
signature, which is what makes the GDPR erasure right enforceable by the member
rather than by an administrator.

## Chain configuration

One deployment entry per chain id, in `front/src/contract.ts`, so a migration
or a rollback is a new entry rather than a rewrite:

| Chain | Id | Role |
|---|---|---|
| Base Sepolia | 84532 | Production since 2026-08-03 |
| Sepolia | 11155111 | Original L1 deployment, kept as rollback target |
| Hardhat | 31337 | Local demo, redeployed on every reset |

The front picks its target from `VITE_CHAIN`, the functions and the indexer
from `CHAIN_ID`. Both default to Sepolia when unset — not because it is
current, but because an environment variable lost by accident should degrade to
a chain that still has a live deployment rather than to nothing.

### Why an L2

The original deployment was on Sepolia (Ethereum L1). Moving to Base, an
Ethereum L2, was a cost decision taken on measured figures rather than
assumed ones: for an association running a handful of votes a year, L1 gas
made routine governance disproportionately expensive, while the same activity
on an L2 costs on the order of a few euros a year. The association's members
are not crypto-native, so a second criterion mattered as much — Base has a
mainstream onramp, which keeps "join the association" from requiring an
exchange account.

Nothing in the code is Base-specific. The chain is configuration, which is what
makes the rollback path real rather than theoretical.

The indexer records which chain its cursor belongs to and starts over from the
deployment block on a mismatch. Without that, switching chains without manually
clearing the stored cursor left it at the other chain's block height, and every
run either rescanned tens of millions of blocks ten at a time until the job
timed out, or skipped every past event.

## Local demo

`npm run demo` starts a Hardhat node plus a control panel that deploys a fresh
contract and can replay scripted governance scenarios, including time travel —
a 90-day probation or a 180-day dormancy delay is not something a live testnet
lets you demonstrate. The front talks to it with `VITE_CHAIN=local`, and the
demo server reimplements the same members-only invariants as the Netlify
functions so the two modes exercise the same front code.

## Shared shapes

The snapshot's shape is declared once, in `front/src/daoSnapshot.ts`, and
imported by the front and by the Netlify function. The two producers written in
plain JavaScript (the indexer and the demo panel) cannot import a TypeScript
type, so they carry an explicit pointer back to it. Before that, the same
structure was declared four independent times and a new field meant remembering
four places with nothing to catch a miss.
