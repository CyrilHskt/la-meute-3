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

`src/contract.ts` contains the contract's address and ABI, copied from
`artifacts/contracts/Meute.sol/Meute.json` at the repo root — regenerate
manually if the contract changes.
