# Front — La Meute

Interface web pour interagir avec le contrat `Meute` déployé sur Sepolia
(C7). Vue 3 + Vite + TypeScript, `viem` pour parler au contrat.

Aucun backend : toute la vérité vit on-chain. La lecture passe par le RPC
public de la chaîne, l'écriture par le wallet connecté (MetaMask ou
équivalent), qui signe les transactions.

## Commandes

```shell
npm install
npm run dev      # serveur de développement
npm run build    # build de production (utilisé par le déploiement Netlify)
```

`src/contract.ts` contient l'adresse et l'ABI du contrat, copiées depuis
`artifacts/contracts/Meute.sol/Meute.json` à la racine du dépôt — à
régénérer manuellement si le contrat change.
