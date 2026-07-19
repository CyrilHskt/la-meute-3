# La Meute 3.0

Prototype de gouvernance décentralisée pour une association loi 1901.
Projet de certification Alyra — RS6515.

## Le problème

La Meute 2.0 est une association de joueurs, vieille de 25 ans, forte d'une quinzaine
de membres. Elle s'endort : la participation aux votes s'effondre et le président doit
relancer les membres un par un pour atteindre le quorum. Or une association dont les
membres ne votent plus est paralysée — plus aucune décision ne peut être prise, pas
même celles qui feraient entrer du sang neuf.

L'absence n'est pourtant pas un refus. Mais dans un quorum calculé sur les inscrits,
le silence d'un membre pèse autant que son opposition, et bloque les autres sans
l'avoir voulu.

Et la même fragilité se lit à l'envers : que devient la Meute si son président
disparaît, ou veut simplement passer la main ? Personne d'autre ne convoque les votes,
la caisse est un compte bancaire au nom du trésorier, et transmettre suppose de refaire
les statuts, la préfecture et le mandat bancaire. Les deux problèmes n'en font qu'un :
**tout repose sur une personne.**

## Le prototype

La Meute 3.0 porte la gouvernance de l'association sur une blockchain publique :

- **Une carte de membre** — un ERC-721 non transférable, qui porte le rang de son
  détenteur et constitue à lui seul le registre des adhérents.
- **Un cycle d'adhésion à deux étages**, repris des usages réels de l'association :
  candidat → Louveteau (probatoire, trois mois) → Loup (définitif), la titularisation
  se jouant sur un vote à trois issues : titulariser, ajourner, refuser.
- **La dormance** — un Loup qui n'a pas voté depuis un an sort du quorum sans rien
  perdre ni être sanctionné, et le moindre vote le réveille. Le quorum se répare de
  lui-même : la meute ne se mesure qu'à ceux qui sont présents.
- **Aucun bureau.** Passé le déploiement, le contrat n'a plus ni propriétaire, ni
  pause, ni fonction d'urgence. Le président n'a aucun pouvoir technique.

Le périmètre s'arrête là : les tournois, les inscriptions et les classements restent
hors-chaîne. Le prototype gère la gouvernance, pas l'activité.

Il s'agit d'un exercice de pensée — « et si l'on transformait la Meute en DAO ? » — et
non d'un projet de mise en production. La coquille juridique loi 1901 demeure ; seule
la mécanique de gouvernance est portée on-chain.

## Documentation

- [Cahier des charges](docs/cahier-des-charges.md) — contexte, périmètre, machine à
  états, justification du jeton, sécurité, limites assumées.

## Stack

Solidity 0.8.28 · Hardhat 3 · OpenZeppelin 5.6 · ethers v6 · mocha
Déploiement via Hardhat Ignition sur testnet public (Sepolia). Aucun ETH réel engagé.

## Commandes

### Tests

```shell
npx hardhat test            # tous les tests
npx hardhat test solidity   # tests unitaires Solidity
npx hardhat test mocha      # tests d'intégration TypeScript
```

### Déploiement

Sur une chaîne locale simulée :

```shell
npx hardhat ignition deploy ignition/modules/<Module>.ts
```

Sur Sepolia, il faut un compte approvisionné en ETH de test. La clé privée est lue
depuis la variable de configuration `SEPOLIA_PRIVATE_KEY`, à renseigner via le plugin
`hardhat-keystore` (elle n'est jamais écrite en clair dans le dépôt) :

```shell
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
npx hardhat ignition deploy --network sepolia ignition/modules/<Module>.ts
```
