# Front — La Meute

Web interface to interact with the `Meute` contract deployed on Base
Sepolia (C7). Vue 3 + Vite + TypeScript, `viem` to talk to the contract.

Governance truth lives on-chain: writes always go through the connected
wallet (MetaMask or equivalent), which signs transactions — no privileged
role after deployment. The overall read (stats, proposals, activity) goes
through a public snapshot rebuilt by an indexer (`scripts/sync-dao.js`)
and served via Netlify Functions (`netlify/functions/`) + Netlify Blobs,
so every visitor doesn't have to scan the chain themselves. These same
functions also handle Discord identity linking (OAuth2,
`discord-link.mts`), stored off-chain — the chain itself can't verify an
OAuth response, and writing unverifiable data on-chain wouldn't add any
trust, only cost. "About me" data (my balance, my donations, my role)
stays read live from the contract, never through this snapshot.

## Commands

```shell
npm install
npm run dev      # development server
npm run build    # production build (used by the Netlify deployment)
```

`npm run dev` targets the public deployment. For the local demo — the whole
governance cycle against a Hardhat node, with time travel — see "Run it
locally" in the [root README](../README.md); it comes down to setting
`VITE_CHAIN=local` here and running the demo panel at the repo root. Use
`npm run dev:netlify` instead of `npm run dev` when you also need the Netlify
functions (members-only reads, Discord linking).

`src/contract.ts` holds one deployment entry per chain id plus the ABI, updated
by hand when the contract changes. It cannot silently drift:
`scripts/generate-contract-meta.js` derives `src/contract-meta.json` from it,
and `scripts/check-contract-sync.js` runs in CI comparing that ABI against the
freshly compiled contract and the `VERSION` constant in the Solidity source.
