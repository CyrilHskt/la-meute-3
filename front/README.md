# Front — La Meute

Interface web pour interagir avec le contrat `Meute` déployé sur Sepolia
(C7). Vue 3 + Vite + TypeScript, `viem` pour parler au contrat.

La vérité de gouvernance vit on-chain : l'écriture passe toujours par le
wallet connecté (MetaMask ou équivalent), qui signe les transactions —
aucun rôle privilégié après déploiement. La lecture d'ensemble (stats,
propositions, activité) passe par un instantané public reconstruit par un
indexeur (`scripts/sync-dao.js`) et servi via des Netlify Functions
(`netlify/functions/`) + Netlify Blobs, pour éviter à chaque visiteur de
scanner la chaîne lui-même. Ces mêmes functions gèrent aussi la liaison
d'identité Discord (OAuth2, `discord-link.mts`), stockée hors-chaîne —
la chaîne ne peut pas elle-même vérifier une réponse OAuth, et écrire une
donnée non-vérifiable on-chain n'ajouterait aucune confiance, seulement du
coût. Les données "à moi" (mon solde, mes dons, mon rôle) restent lues en
direct depuis le contrat, jamais via cet instantané.

## Commandes

```shell
npm install
npm run dev      # serveur de développement
npm run build    # build de production (utilisé par le déploiement Netlify)
```

`src/contract.ts` contient l'adresse et l'ABI du contrat, copiées depuis
`artifacts/contracts/Meute.sol/Meute.json` à la racine du dépôt — à
régénérer manuellement si le contrat change.
