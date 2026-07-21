// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

/// @title La Meute 3.0 — carte de membre et gouvernance
/// @notice Contrat unique : ERC-721 non transférable (registre des membres) et
///         mécanique de gouvernance (candidature, vote, exécution). Voir
///         docs/cahier-des-charges.md et docs/recap-conception.md §9 pour la
///         justification du choix d'un contrat unique plutôt que deux contrats
///         séparés.
/// @dev Aucun rôle privilégié après déploiement : pas d'owner, pas de pause,
///      pas d'upgrade. Le constructeur mint les cartes des fondateurs, seul
///      moment où une carte apparaît sans vote (§9 du cahier des charges).
contract Meute is ERC721, ReentrancyGuard {
    using EnumerableSet for EnumerableSet.AddressSet;
    using Strings for address;

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    /// @notice Rang porté par une carte.
    enum Rang {
        Louveteau,
        Loup
    }

    /// @notice Type d'une proposition. Les quatre partagent une seule mécanique
    ///         de vote (§7.0 du cahier des charges) ; seule l'exécution
    ///         consulte le type pour décider quoi appliquer.
    enum TypeProposition {
        Admission,
        Titularisation,
        Exclusion,
        Depense
    }

    /// @notice Choix exprimé par un votant. Sémantique fixe, valable pour
    ///         tous les types de proposition :
    ///         - Approuver = favorable (pour une titularisation : titulariser)
    ///         - Rejeter   = défavorable (pour une titularisation : refuser)
    ///         - Ajourner  = report ; n'a de sens que pour une titularisation,
    ///                       rejeté par {voter} pour tout autre type (§7.3).
    enum ChoixVote {
        Approuver,
        Rejeter,
        Ajourner
    }

    /// @notice Données portées par une carte. Rang et horodatage compacté en
    ///         un seul slot de stockage (§10 du cahier des charges, poste "Gas").
    /// @dev `derniereActivite` a un sens différent selon le rang, jamais les
    ///      deux à la fois : pour un Loup, c'est la dormance (§7.5) — mis à
    ///      jour à chaque vote. Pour un Louveteau, qui ne vote jamais, c'est
    ///      le point de départ de la probation en cours — mis à jour au mint
    ///      et à chaque ajournement (§7.3). Un seul champ, deux usages
    ///      mutuellement exclusifs plutôt qu'un champ par rang.
    struct Carte {
        Rang rang;
        uint40 derniereActivite;
        uint8 ajournements; // nombre d'ajournements déjà consommés (max AJOURNEMENTS_MAX)
    }

    /// @notice Une proposition en cours ou terminée.
    struct Proposition {
        TypeProposition typeProp;
        address cible; // candidat / membre visé / bénéficiaire de dépense (selon typeProp)
        uint64 echeance; // timestamp de clôture du vote (ouverture + 7 jours)
        uint32 snapshotActifs; // dénominateur figé — voir snapshotFige
        bool snapshotFige; // true dès que le snapshot a été pris (première voix ou ouverture)
        bool executee;
        // Un compteur par valeur de {ChoixVote}, quel que soit le type de la
        // proposition. votesAjourner reste à 0 pour les propositions binaires,
        // puisque {voter} rejette ce choix pour elles (voir ChoixVote).
        uint32 votesApprouver;
        uint32 votesRejeter;
        uint32 votesAjourner;
        // paramètres propres au type Depense
        uint256 montant;
        string motif;
    }

    // ---------------------------------------------------------------------
    // Stockage
    // ---------------------------------------------------------------------

    /// @notice Cotisation exacte due à la candidature, non modifiable.
    uint256 public immutable cotisation;

    /// @notice Durée de la période probatoire avant qu'un vote de
    ///         titularisation puisse être ouvert.
    uint256 public constant DUREE_PROBATION = 90 days;

    /// @notice Nombre maximum d'ajournements avant qu'un Louveteau ne puisse
    ///         plus qu'être titularisé ou refusé.
    uint8 public constant AJOURNEMENTS_MAX = 2;

    /// @notice Délai d'inactivité au-delà duquel un Loup devient dormant.
    uint256 public constant DELAI_DORMANCE = 365 days;

    /// @notice Durée pendant laquelle une proposition reste ouverte au vote.
    uint256 public constant DUREE_VOTE = 7 days;

    /// @dev Carte de chaque membre, indexée directement par adresse. Une carte
    ///      n'existe (au sens ERC-721) que si {_estMembre} est vrai — voir
    ///      cette fonction pour la condition exacte.
    ///      @dev Le tokenId ERC-721 correspondant à une adresse n'est jamais
    ///      choisi ni compté : c'est l'adresse elle-même, réinterprétée comme
    ///      un entier ({_tokenId}). Une carte, une adresse, toute la vie du
    ///      membre — un identifiant arbitraire n'apporterait rien et
    ///      obligerait à maintenir un compteur et un mapping supplémentaires.
    mapping(address membre => Carte) private _cartes;

    /// @dev Ensemble des adresses actuellement au rang Loup (dormants inclus).
    ///      Sa taille n'est pas contrôlable par un attaquant : devenir Loup
    ///      exige de passer un vote réel, pas un spam gratuit (§10 du cahier
    ///      des charges, poste "DoS") — la boucle sur cet ensemble dans
    ///      {loupsActifs} reste donc bornée par la croissance réelle de la
    ///      meute, pas par un tableau arbitraire.
    EnumerableSet.AddressSet private _loups;

    /// @dev Propositions par identifiant.
    mapping(uint256 proposalId => Proposition) private _propositions;

    /// @dev Registre des votes déjà exprimés, pour empêcher le double vote.
    mapping(uint256 proposalId => mapping(address votant => bool)) private _aVote;

    /// @dev Empêche une seconde candidature ouverte simultanément pour la même adresse.
    mapping(address candidat => bool) private _candidatureOuverte;

    /// @dev Empêche deux Loups d'ouvrir simultanément deux votes de
    ///      titularisation pour le même Louveteau. Symétrique à
    ///      {_candidatureOuverte}.
    mapping(address louveteau => bool) private _titularisationOuverte;

    uint256 private _prochainProposalId;

    // ---------------------------------------------------------------------
    // Erreurs
    // ---------------------------------------------------------------------

    error CotisationIncorrecte();
    error CandidatureDejaOuverte();
    error DejaMembre();
    error PasCandidat();
    error PasLouveteau();
    error PasLoup();
    error ProbationNonTerminee();
    error VoteFerme();
    error VoteEncoreOuvert();
    error DejaVote();
    error ProposalInconnue();
    error DejaExecutee();
    error ChoixInvalide();
    error TransfertInterdit();
    error MontantInvalide();
    error AucunFondateur();
    error FondsInsuffisants();
    error TransfertEchoue();
    error PasMembre();
    error TitularisationDejaOuverte();

    // ---------------------------------------------------------------------
    // Événements
    // ---------------------------------------------------------------------

    /// @dev Un event ne peut indexer que 3 paramètres au maximum : `auteur`
    ///      (nouveau, pour retrouver les propositions ouvertes par une
    ///      adresse — impossible avant, `cible` ne s'y prête pas puisque
    ///      pour une exclusion ou une dépense elle désigne la victime/le
    ///      bénéficiaire, pas l'auteur) prend la place laissée par
    ///      `typeProp`, qui reste lisible dans le log, juste non filtrable
    ///      par topic.
    event PropositionOuverte(
        uint256 indexed proposalId,
        address indexed cible,
        address indexed auteur,
        TypeProposition typeProp
    );
    event VoteExprime(uint256 indexed proposalId, address indexed votant);
    event PropositionExecutee(uint256 indexed proposalId);
    event MembreReveille(address indexed membre);

    // ---------------------------------------------------------------------
    // Construction
    // ---------------------------------------------------------------------

    /// @notice Déploie le contrat et mint les cartes des membres fondateurs.
    /// @param fondateurs Adresses des membres fondateurs, mintées au rang Loup.
    /// @param montantCotisation Montant exact exigé à chaque candidature.
    constructor(address[] memory fondateurs, uint256 montantCotisation) ERC721("Carte de Meute", "MEUTE") {
        if (fondateurs.length == 0) revert AucunFondateur();
        if (montantCotisation == 0) revert MontantInvalide();

        cotisation = montantCotisation;

        for (uint256 i = 0; i < fondateurs.length; i++) {
            _minterCarte(fondateurs[i], Rang.Loup);
        }
    }

    // ---------------------------------------------------------------------
    // Cycle de vie d'une proposition — ouverture (§7.0-7.4)
    // ---------------------------------------------------------------------

    /// @notice Ouvre une candidature. Le candidat lui-même l'ouvre, en versant
    ///         la cotisation exacte (§7.1). Une seule candidature ouverte par adresse.
    function candidater() external payable {
        if (msg.value != cotisation) revert CotisationIncorrecte();
        if (_estMembre(msg.sender)) revert DejaMembre();
        if (_candidatureOuverte[msg.sender]) revert CandidatureDejaOuverte();

        _candidatureOuverte[msg.sender] = true;
        _ouvrirProposition(TypeProposition.Admission, msg.sender, 0, "");
    }

    /// @notice Ouvre un vote de titularisation pour un Louveteau dont la
    ///         probation (initiale ou prolongée par ajournement) est terminée.
    ///         Ouvrable par n'importe quel Loup (§7.3).
    /// @param louveteau Adresse du Louveteau concerné.
    function ouvrirTitularisation(address louveteau) external {
        if (_cartes[msg.sender].rang != Rang.Loup) revert PasLoup();
        // rang == Louveteau vaut aussi par défaut pour une adresse sans
        // carte : _estMembre lève l'ambiguïté (voir sa NatSpec).
        if (!_estMembre(louveteau) || _cartes[louveteau].rang != Rang.Louveteau) revert PasLouveteau();
        if (block.timestamp < _cartes[louveteau].derniereActivite + DUREE_PROBATION) revert ProbationNonTerminee();
        if (_titularisationOuverte[louveteau]) revert TitularisationDejaOuverte();

        _titularisationOuverte[louveteau] = true;
        _ouvrirProposition(TypeProposition.Titularisation, louveteau, 0, "");
    }

    /// @notice Ouvre un vote d'exclusion visant un Loup ou un Louveteau (§7.4).
    ///         Ouvrable par n'importe quel Loup.
    /// @param membre Adresse du membre visé.
    function proposerExclusion(address membre) external {
        if (_cartes[msg.sender].rang != Rang.Loup) revert PasLoup();
        if (!_estMembre(membre)) revert PasMembre();

        _ouvrirProposition(TypeProposition.Exclusion, membre, 0, "");
    }

    /// @notice Ouvre un vote de dépense de trésorerie (§7.6). Ouvrable par
    ///         n'importe quel Loup. Le solde n'est vérifié qu'à l'exécution
    ///         (FondsInsuffisants) : il peut changer entre l'ouverture et
    ///         l'exécution si d'autres dépenses sont votées entre-temps.
    /// @param beneficiaire Destinataire du transfert si la dépense est votée.
    /// @param montant Montant en wei à transférer.
    /// @param motif Description de la dépense.
    function proposerDepense(address beneficiaire, uint256 montant, string calldata motif) external {
        if (_cartes[msg.sender].rang != Rang.Loup) revert PasLoup();
        if (montant == 0) revert MontantInvalide();

        _ouvrirProposition(TypeProposition.Depense, beneficiaire, montant, motif);
    }

    // ---------------------------------------------------------------------
    // Cycle de vie d'une proposition — vote et exécution (§7.0)
    // ---------------------------------------------------------------------

    /// @notice Vote unique, quel que soit le type de proposition. Réveille le
    ///         votant s'il était dormant (§7.5).
    /// @dev Rejette (ChoixInvalide) un choix Ajourner sur toute proposition
    ///      dont le type n'est pas Titularisation, ainsi que sur une
    ///      titularisation dont la cible a déjà consommé AJOURNEMENTS_MAX
    ///      ajournements — "on ne peut pas être louveteau à vie" (§7.3).
    /// @param proposalId Identifiant de la proposition.
    /// @param choix Voir {ChoixVote} pour la sémantique.
    function voter(uint256 proposalId, ChoixVote choix) external {
        if (proposalId >= _prochainProposalId) revert ProposalInconnue();
        Proposition storage prop = _propositions[proposalId];

        if (block.timestamp >= prop.echeance) revert VoteFerme();
        if (_cartes[msg.sender].rang != Rang.Loup) revert PasLoup();
        if (_aVote[proposalId][msg.sender]) revert DejaVote();
        if (choix == ChoixVote.Ajourner) {
            if (prop.typeProp != TypeProposition.Titularisation) revert ChoixInvalide();
            if (_cartes[prop.cible].ajournements >= AJOURNEMENTS_MAX) revert ChoixInvalide();
        }

        if (prop.snapshotFige) {
            // Cas normal : le dénominateur est figé depuis l'ouverture. Se
            // réveiller ici ne l'agrandit pas — neutralise le front-running
            // du réveil (§10 du cahier des charges).
            _reveiller(msg.sender);
        } else {
            // Cas limite §7.5 : la meute était totalement dormante à
            // l'ouverture, donc le snapshot a été laissé en attente. Ce
            // premier votant se réveille d'abord, puis le snapshot est pris
            // juste après : il devient lui-même le dénominateur qu'il vient
            // de reconstituer, et non un simple numérateur en plus d'un
            // dénominateur qui l'ignorerait.
            _reveiller(msg.sender);
            prop.snapshotActifs = uint32(loupsActifs());
            prop.snapshotFige = true;
        }

        _aVote[proposalId][msg.sender] = true;

        if (choix == ChoixVote.Approuver) {
            prop.votesApprouver++;
        } else if (choix == ChoixVote.Rejeter) {
            prop.votesRejeter++;
        } else {
            prop.votesAjourner++;
        }

        emit VoteExprime(proposalId, msg.sender);
    }

    /// @notice Applique le résultat d'une proposition dont le délai est
    ///         écoulé. Appelable par n'importe qui, membre ou non (§7.0) —
    ///         c'est une simple corvée mécanique, pas une décision.
    /// @param proposalId Identifiant de la proposition à exécuter.
    function executer(uint256 proposalId) external nonReentrant {
        if (proposalId >= _prochainProposalId) revert ProposalInconnue();
        Proposition storage prop = _propositions[proposalId];

        if (prop.executee) revert DejaExecutee();
        if (block.timestamp < prop.echeance) revert VoteEncoreOuvert();

        // Marqué avant tout transfert externe (remboursement, dépense) —
        // checks-effects-interactions, en plus du modifier nonReentrant.
        prop.executee = true;

        if (prop.typeProp == TypeProposition.Admission) {
            _executerAdmission(prop);
        } else if (prop.typeProp == TypeProposition.Titularisation) {
            _executerTitularisation(prop);
        } else if (prop.typeProp == TypeProposition.Exclusion) {
            _executerExclusion(prop);
        } else {
            _executerDepense(prop);
        }

        emit PropositionExecutee(proposalId);
    }

    /// @notice Réactive explicitement l'appelant sans attendre qu'une
    ///         proposition passe, afin d'être recompté dans le quorum avant
    ///         qu'une décision ne s'ouvre (§7.5).
    function jeSuisLa() external {
        if (_cartes[msg.sender].rang != Rang.Loup) revert PasLoup();
        _reveiller(msg.sender);
    }

    /// @notice Démission volontaire, immédiate, sans vote (§7.4). Brûle la
    ///         carte, qu'elle soit au rang Louveteau ou Loup.
    function demissionner() external {
        if (!_estMembre(msg.sender)) revert PasMembre();
        _titularisationOuverte[msg.sender] = false;
        _bruler(msg.sender);
    }

    // ---------------------------------------------------------------------
    // Lecture — propositions, quorum et dormance
    // ---------------------------------------------------------------------

    /// @notice Lecture d'une proposition. Utile aux tests et au front (C7).
    function proposition(uint256 proposalId) external view returns (Proposition memory) {
        return _propositions[proposalId];
    }

    /// @notice Lecture de la carte d'un membre. Rang par défaut (Louveteau)
    ///         et champs nuls si l'adresse n'est pas membre — voir {_estMembre}.
    function carte(address membre) external view returns (Carte memory) {
        return _cartes[membre];
    }

    /// @notice Indique si une adresse membre est actuellement dormante
    ///         (Loup sans participation depuis DELAI_DORMANCE). Faux pour un
    ///         Louveteau ou une adresse sans carte : la dormance ne concerne
    ///         que les Loups (§7.5).
    function estDormant(address membre) public view returns (bool) {
        Carte storage c = _cartes[membre];
        return c.rang == Rang.Loup && block.timestamp - c.derniereActivite > DELAI_DORMANCE;
    }

    /// @notice Nombre de Loups actifs au moment de l'appel (hors dormants).
    /// @dev Recalculé à chaque appel en parcourant {_loups} — voir la
    ///      justification de la boucle bornée sur ce champ. C'est ce qui
    ///      rend la dormance réellement passive : aucune transaction n'est
    ///      nécessaire pour qu'un Loup sorte de ce décompte (§7.5).
    function loupsActifs() public view returns (uint256 actifs) {
        uint256 n = _loups.length();
        for (uint256 i = 0; i < n; i++) {
            if (!estDormant(_loups.at(i))) {
                actifs++;
            }
        }
    }

    // ---------------------------------------------------------------------
    // ERC-721 — non-transférabilité et métadonnées on-chain (§6)
    // ---------------------------------------------------------------------

    /// @dev Bloque tout transfert entre deux détenteurs tout en laissant
    ///      passer le mint (from == 0) et le burn (to == 0). Voir
    ///      docs/recap-conception.md pour le piège à éviter : ne pas bloquer
    ///      mint/burn en même temps que le transfert.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert TransfertInterdit();
        return super._update(to, tokenId, auth);
    }

    /// @notice Métadonnées 100% on-chain : JSON + SVG encodés en Base64,
    ///         générés par le contrat, sans dépendance à un serveur ou IPFS (§6).
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);

        address membre = address(uint160(tokenId));
        Rang rang = _cartes[membre].rang;
        string memory rangNom = rang == Rang.Loup ? "Loup" : "Louveteau";

        string memory json = string.concat(
            '{"name":"Carte de Meute - ',
            rangNom,
            '","description":"Carte de membre non transferable de La Meute. ',
            "Detenteur : ",
            membre.toHexString(),
            '.","attributes":[{"trait_type":"Rang","value":"',
            rangNom,
            '"}],"image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(_svg(rang))),
            '"}'
        );

        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    // ---------------------------------------------------------------------
    // Interne
    // ---------------------------------------------------------------------

    /// @dev tokenId associé à une adresse : l'adresse elle-même, réinterprétée
    ///      comme un entier. Déterministe, jamais stocké ni compté.
    function _tokenId(address membre) private pure returns (uint256) {
        return uint256(uint160(membre));
    }

    /// @dev Un membre "existe" (candidat exclu) tant que sa carte n'a pas été
    ///      brûlée. `derniereActivite` sert de marqueur : nul avant mint et
    ///      après burn, toujours non nul entre les deux (mis à jour à chaque
    ///      vote, jamais remis à zéro tant que la carte vit).
    function _estMembre(address membre) private view returns (bool) {
        return _cartes[membre].derniereActivite != 0;
    }

    /// @dev Crée une proposition et l'ouvre pour {DUREE_VOTE}. Partagée par
    ///      les quatre fonctions d'ouverture (§7.0 : une seule mécanique,
    ///      quel que soit le type). Fige le snapshot de quorum immédiatement
    ///      si la meute a au moins un Loup actif ; sinon le laisse en attente
    ///      pour le premier vote (cas limite §7.5, voir {voter}).
    /// @param montant Pertinent seulement pour TypeProposition.Depense ; 0 sinon.
    /// @param motif Pertinent seulement pour TypeProposition.Depense ; "" sinon.
    function _ouvrirProposition(
        TypeProposition typeProp,
        address cible,
        uint256 montant,
        string memory motif
    ) private returns (uint256 proposalId) {
        proposalId = _prochainProposalId++;

        uint256 actifs = loupsActifs();
        bool snapshotFige = actifs != 0;

        _propositions[proposalId] = Proposition({
            typeProp: typeProp,
            cible: cible,
            echeance: uint64(block.timestamp + DUREE_VOTE),
            snapshotActifs: snapshotFige ? uint32(actifs) : 0,
            snapshotFige: snapshotFige,
            executee: false,
            votesApprouver: 0,
            votesRejeter: 0,
            votesAjourner: 0,
            montant: montant,
            motif: motif
        });

        // msg.sender ici est bien l'appelant externe d'origine (candidater,
        // ouvrirTitularisation, proposerExclusion ou proposerDepense) :
        // _ouvrirProposition est un appel interne, pas externe, donc
        // msg.sender n'est jamais réécrit entre les deux.
        emit PropositionOuverte(proposalId, cible, msg.sender, typeProp);
    }

    /// @dev Majorité simple sur le dénominateur figé : strictement plus de la
    ///      moitié, jamais une simple égalité (§7.5 : "un seuil > moitié du
    ///      snapshot"). Vaut aussi pour une proposition jamais votée
    ///      (snapshotActifs et votesApprouver tous deux nuls : 0 > 0 est faux,
    ///      donc rejetée par défaut sans cas particulier à coder).
    function _approuvee(Proposition storage prop) private view returns (bool) {
        return prop.votesApprouver * 2 > prop.snapshotActifs;
    }

    /// @dev Admission : mint une carte Louveteau si approuvée, sinon
    ///      rembourse la cotisation séquestrée (§7.2).
    function _executerAdmission(Proposition storage prop) private {
        address candidatAddr = prop.cible;
        _candidatureOuverte[candidatAddr] = false;

        if (_approuvee(prop)) {
            _minterCarte(candidatAddr, Rang.Louveteau);
        } else {
            _rembourser(candidatAddr);
        }
    }

    /// @dev Exclusion : brûle la carte si approuvée, ne fait rien sinon (§7.4).
    ///      No-op si la cible a déjà démissionné entre l'ouverture et
    ///      l'exécution : il n'y a plus de carte à brûler.
    function _executerExclusion(Proposition storage prop) private {
        if (!_estMembre(prop.cible)) return;
        if (_approuvee(prop)) {
            _bruler(prop.cible);
        }
    }

    /// @dev Dépense : transfère le montant si approuvée, ne fait rien sinon (§7.6).
    function _executerDepense(Proposition storage prop) private {
        if (_approuvee(prop)) {
            if (address(this).balance < prop.montant) revert FondsInsuffisants();
            (bool ok, ) = prop.cible.call{value: prop.montant}("");
            if (!ok) revert TransfertEchoue();
        }
    }

    /// @dev Titularisation : vote ternaire à majorité relative, mais
    ///      l'ajournement est l'issue par défaut si le quorum (participation
    ///      > moitié du snapshot) n'est pas atteint — la seule issue qui ne
    ///      lèse personne quand la meute est restée silencieuse (§7.3). Ce
    ///      défaut passif reste possible même une fois AJOURNEMENTS_MAX
    ///      atteint (seul le choix *actif* Ajourner est barré par {voter}) :
    ///      un vote sans quorum n'est pas une décision de la meute de
    ///      prolonger, c'est l'absence de décision, qui ne doit ni
    ///      titulariser ni exclure. Réutilise {ChoixVote} pour désigner
    ///      l'issue : Approuver = titulariser, Rejeter = refuser, Ajourner =
    ///      ajourner — même enum que pour voter, pas de type supplémentaire
    ///      à maintenir.
    function _executerTitularisation(Proposition storage prop) private {
        _titularisationOuverte[prop.cible] = false;
        // Le Louveteau a démissionné entre l'ouverture et l'exécution : plus
        // rien à titulariser, refuser ou ajourner.
        if (!_estMembre(prop.cible)) return;

        uint32 total = prop.votesApprouver + prop.votesRejeter + prop.votesAjourner;
        bool quorumAtteint = total * 2 > prop.snapshotActifs;

        ChoixVote issue = ChoixVote.Ajourner;
        if (quorumAtteint) {
            if (prop.votesApprouver > prop.votesRejeter && prop.votesApprouver > prop.votesAjourner) {
                issue = ChoixVote.Approuver;
            } else if (prop.votesRejeter > prop.votesApprouver && prop.votesRejeter > prop.votesAjourner) {
                issue = ChoixVote.Rejeter;
            }
            // Égalité entre les trois issues, ou Ajourner déjà majoritaire :
            // issue reste Ajourner, pour la même raison que le défaut sans quorum.
        }

        if (issue == ChoixVote.Approuver) {
            _cartes[prop.cible].rang = Rang.Loup;
            _cartes[prop.cible].derniereActivite = uint40(block.timestamp);
            _loups.add(prop.cible);
        } else if (issue == ChoixVote.Rejeter) {
            _bruler(prop.cible);
        } else {
            Carte storage cible = _cartes[prop.cible];
            // Saturé à AJOURNEMENTS_MAX : le défaut passif peut se répéter
            // sans jamais faire déborder le compteur ni fausser {voter}.
            if (cible.ajournements < AJOURNEMENTS_MAX) {
                cible.ajournements++;
            }
            cible.derniereActivite = uint40(block.timestamp);
        }
    }

    /// @dev Brûle la carte d'un membre, quel que soit son rang.
    function _bruler(address membre) private {
        if (_cartes[membre].rang == Rang.Loup) {
            _loups.remove(membre);
        }
        uint256 tokenId = _tokenId(membre);
        delete _cartes[membre];
        _burn(tokenId);
    }

    /// @dev Rembourse la cotisation à un candidat refusé.
    function _rembourser(address candidatAddr) private {
        (bool ok, ) = candidatAddr.call{value: cotisation}("");
        if (!ok) revert TransfertEchoue();
    }

    /// @dev Mint une carte au rang donné. Utilisé pour les fondateurs (rang
    ///      Loup, au déploiement) et pour un candidat admis (rang Louveteau,
    ///      depuis {_executerAdmission}).
    function _minterCarte(address membre, Rang rang) private {
        _cartes[membre] = Carte({rang: rang, derniereActivite: uint40(block.timestamp), ajournements: 0});

        if (rang == Rang.Loup) {
            _loups.add(membre);
        }

        _mint(membre, _tokenId(membre));
    }

    /// @dev Met à jour l'horodatage de dernière activité. Si le membre
    ///      sortait de dormance, ne touche à aucun compteur — {loupsActifs}
    ///      le recomptera de lui-même au prochain appel — mais émet
    ///      l'événement pour la traçabilité.
    function _reveiller(address membre) private {
        if (estDormant(membre)) {
            emit MembreReveille(membre);
        }
        _cartes[membre].derniereActivite = uint40(block.timestamp);
    }

    /// @dev Génère le SVG on-chain correspondant à un rang : une empreinte
    ///      de patte (coussinet + 4 doigts + 4 griffes), en contour pour
    ///      Louveteau et en silhouette pleine pour Loup — même jeu de
    ///      formes dans les deux cas, seul l'habillage change. Tracé
    ///      original, dessiné pour ce projet.
    function _svg(Rang rang) private pure returns (string memory) {
        string memory habillage = rang == Rang.Loup
            ? 'fill="#161311"'
            : 'fill="none" stroke="#161311" stroke-width="10" stroke-linejoin="round"';

        return
            string.concat(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><g ',
                habillage,
                ">",
                '<path d="M256 258 L325 330 L350 420 L290 470 L256 452 L222 470 L162 420 L187 330 Z"/>',
                '<path d="M182 118 L210 86 L244 112 L252 178 L222 228 L176 206 L158 162 Z"/>',
                '<path d="M330 118 L302 86 L268 112 L260 178 L290 228 L336 206 L354 162 Z"/>',
                '<path d="M96 214 L132 182 L176 214 L184 292 L150 352 L106 330 L84 270 Z"/>',
                '<path d="M416 214 L380 182 L336 214 L328 292 L362 352 L406 330 L428 270 Z"/>',
                '<polygon points="196,58 214,18 230,66"/>',
                '<polygon points="316,58 298,18 282,66"/>',
                '<polygon points="82,182 96,144 110,188"/>',
                '<polygon points="430,182 416,144 402,188"/>',
                "</g></svg>"
            );
    }
}
