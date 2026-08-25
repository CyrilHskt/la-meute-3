# Tableau des attaques connues

Catalogue des attaques documentées sur la technologie employée — Solidity et
l'EVM pour la chaîne, plus la surface applicative qui entoure le contrat — et,
pour chacune, ce qui protège **cette** application, la preuve associée, et le
risque qui subsiste.

Trois colonnes de statut :
**Neutralisée** (une défense explicite existe et est testée) ·
**Mitigée** (le risque est réduit, pas supprimé) ·
**Sans objet** (le motif vulnérable n'existe pas dans ce code).

---

## 1. Attaques sur le contrat

| Attaque | Statut | Protection dans La Meute 3.0 | Preuve |
|---|---|---|---|
| **Reentrancy** — le destinataire d'un transfert rappelle le contrat avant la fin de l'exécution | Neutralisée | Deux défenses cumulées : `prop.executed = true` écrit **avant** tout appel externe (checks-effects-interactions), et le modifier `nonReentrant` d'OpenZeppelin. Les deux seuls appels externes (`_refund`, `_executeExpense`) partent de `execute()` | `ReentrantExpenseBeneficiary.sol` : contrat d'attaque réel qui tente la réentrance depuis son `receive()`, la suite assère l'échec |
| **Reentrancy en lecture** (*read-only reentrancy*) — lire un état incohérent pendant un appel externe | Sans objet | Aucune vue n'est consultée par un tiers pendant un appel externe : les transferts sont la toute dernière opération, après l'écriture d'état | Lecture de `execute()` |
| **DoS par limite de gas** — boucle sur une structure non bornée | **Mitigée** | `activeWolves()` itère sur `_wolves`. La taille n'est pas contrôlable par un attaquant (devenir Loup exige une candidature, 90 j de probation et un vote à 75 %), et `pruneDormant()` — permissionless — permet à quiconque de retirer un dormant vérifié | `pruneDormant` testé ; risque documenté dans [security.md](security.md) |
| **DoS par revert inattendu** — un destinataire qui refuse les fonds bloque le traitement | **Mitigée** | Chaque proposition est traitée isolément : un bénéficiaire qui refuse l'ETH ne bloque que **sa** dépense, jamais celles des autres. Pas de traitement par lot | `RejectEther.sol` |
| **Force feeding** — envoi d'ETH forcé via `selfdestruct` ou adresse `CREATE2` pré-calculée | Neutralisée par conception | Aucune invariante ne dépend du solde. Le quorum se calcule sur un **nombre** de Loups ; `address(this).balance` n'est lu qu'à un seul endroit, pour vérifier qu'une dépense votée est payable | Lecture de `_quorumReached` et `_executeExpense` |
| **Valeur de retour d'appel externe ignorée** | Neutralisée | `.call{value:}` renvoie `false` au lieu de revert : la valeur est testée et `TransferFailed` est levée | `_refund`, `_executeExpense` |
| **Dépassement arithmétique** (*overflow / underflow*) | Neutralisée | Solidity 0.8.x revert nativement. Deux points renforcés : élargissement en `uint256` **avant** multiplication dans le calcul de quorum, et saturation du compteur de reports (un `uint8` qui boucle rendrait des reports à un Louveteau qui les a épuisés) | `_quorumReached`, `_executeConfirmation` |
| **Contrôle d'accès manquant ou trop large** | Neutralisée | Aucun rôle privilégié n'existe après déploiement — donc aucune clé à voler. Chaque fonction mutante porte son garde de rang, vérifié on-chain | Tests par fonction ; absence d'`owner`/`pause`/`upgrade` |
| **Front-running / MEV** — observer une transaction en attente pour la devancer | Neutralisée sur le vecteur pertinent | Le dénominateur du quorum est **gelé à l'ouverture**. Sans ce gel, réveiller des dormants complices juste avant la clôture ferait échouer n'importe quelle proposition en gonflant l'électorat | `activeSnapshot` / `snapshotFrozen` ; tests de dormance |
| **Dépendance à `block.timestamp`** | Sans objet en pratique | Les délais se comptent en jours (7 / 90 / 180). La marge de manipulation d'un validateur se compte en secondes | Constantes `VOTE_DURATION`, `PROBATION_DURATION`, `DORMANCY_DELAY` |
| **Spam / griefing** — inonder le contrat de propositions | **Mitigée** | Une seule candidature ouverte par adresse, et chaque candidature immobilise la cotisation 7 jours. Aucune boucle on-chain sur les propositions, donc la chaîne n'est pas affectée | `_applicationOpen` ; limite hors chaîne documentée |
| **Double vote** | Neutralisée | Registre `_hasVoted[proposalId][voter]` | Tests de vote |
| **Vote sur son propre cas** (conflit d'intérêts) | Neutralisée | La cible d'une exclusion ou d'une dépense ne peut pas voter, et sort du dénominateur pour ne pas rendre le quorum inatteignable | `ConflictOfInterest`, `_activeForQuorum` |
| **Censure par inaction** — personne n'exécute un résultat voté | Neutralisée | `execute()` est ouverte à quiconque, membre ou non : le bénéficiaire d'une décision peut la déclencher lui-même | `execute()` sans garde de rang |
| **Décision emportée par un votant unique** | Neutralisée | Bug réel trouvé en revue : une version antérieure ne comparait que les « oui » au snapshot. Corrigé en exigeant **quorum de participation ET majorité stricte** | `_isPassed` |
| **`tx.origin` détourné par hameçonnage** | Sans objet | `tx.origin` n'est utilisé nulle part ; toutes les vérifications passent par `msg.sender` | Absence d'occurrence dans le source |
| **Collision de stockage / `delegatecall`** | Sans objet | Aucun proxy, aucun `delegatecall`, aucune upgradabilité — choix assumé | Absence d'occurrence |
| **Aléa manipulable** (*bad randomness*) | Sans objet | Le contrat ne tire aucun aléa | Absence d'occurrence |
| **Transfert non désiré du jeton** | Neutralisée | Carte non transférable : `_update` bloque tout transfert entre détenteurs, tout en laissant passer frappe et destruction | Tests de non-transférabilité |

---

## 2. Analyse critique des interactions utilisateur

Le contrat peut être correct et l'application rester attaquable : tout ce qui
**écrit dans ce que les utilisateurs lisent** fait partie de la surface. Cette
section applique le tableau ci-dessus aux interactions réelles.

| Interaction | Attaque envisagée | Statut | Ce qui protège |
|---|---|---|---|
| Rafraîchir l'instantané après une transaction (`?key=patch-proposal`, endpoint public) | Injecter des données inventées depuis le navigateur | **Faille réelle trouvée puis corrigée** | L'endpoint recopiait le champ `author` du corps de la requête : n'importe qui pouvait changer l'auteur affiché d'une proposition jusqu'au passage suivant de l'indexeur. Le client n'envoie plus que l'identifiant et le hash de **sa** transaction ; le serveur relit la proposition on-chain et décode l'auteur depuis le log `ProposalOpened` du reçu, en vérifiant la correspondance d'identifiant. Le pire cas devient un auteur inconnu, plus un auteur falsifié |
| Prouver son appartenance pour lire la gouvernance | Rejouer une signature capturée | **Mitigée, assumée** | Nonce signé, horodaté, lié au wallet et à un usage précis, valable 5 min — mais sans stockage, donc **non consommé** : rejouable pendant sa durée de vie. Sans conséquence, puisque rejouer n'ouvre une session que pour un wallet déjà contrôlé par l'attaquant |
| Rester connecté sans re-signer | Conserver l'accès après exclusion | **Mitigée, assumée** | Le solde de carte est vérifié **on-chain à chaque première demande**, jamais depuis un cache : un membre exclu ne peut plus obtenir de session. Compromis assumé : une session déjà émise reste valable jusqu'à 30 min |
| Lier son compte Discord (OAuth2) | CSRF sur le retour d'autorisation | Neutralisée | Paramètre `state` signé et vérifié au retour |
| Revenir sur le site après OAuth | Redirection ouverte (*open redirect*) | Neutralisée | `returnTo` borné à la même origine ; toute valeur externe retombe sur la racine |
| Délier son compte Discord | Délier le compte d'autrui | Neutralisée | Exige une signature du wallet concerné — c'est ce qui fait du droit à l'effacement un droit exercé par le membre, pas une faveur d'administrateur |
| Appeler l'endpoint public en boucle | Épuiser le quota RPC | **Mitigée** | Un patch par proposition toutes les 10 s, le compteur étant lui-même stocké et purgé de ses entrées expirées |
| Lire l'instantané sans être membre | Accéder aux données de gouvernance | Neutralisée | Instantané servi uniquement contre session valide, elle-même adossée à une signature et à une vérification de solde |
| Toute écriture depuis l'interface | Un serveur agit à la place de l'utilisateur | Sans objet par conception | Aucune écriture ne transite par un serveur : toute mutation d'état est une transaction signée par le wallet |

---

## 3. Ce qui reste ouvert

Énoncé volontairement, plutôt qu'omis :

- La boucle d'`activeWolves()` est **mitigée** par `pruneDormant`, pas supprimée : l'ensemble peut croître entre deux purges et rien n'oblige quiconque à appeler la fonction.
- Un bénéficiaire dont le `receive()` revert bloque sa propre dépense. Le motif *pull payment* l'éviterait, au prix d'une étape supplémentaire pour tous les bénéficiaires légitimes.
- N propositions ouvertes depuis N adresses restent possibles. La chaîne n'en souffre pas ; l'indexeur hors chaîne relit toutes les propositions à chaque passage.
- Une session déjà émise survit jusqu'à 30 minutes à une exclusion.
- Le contrat n'étant pas upgradable, aucune de ces limites ne peut être corrigée autrement que par un redéploiement — c'est le prix assumé de l'absence de rôle privilégié.
