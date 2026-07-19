// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
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
    struct Carte {
        Rang rang;
        uint40 derniereActivite; // timestamp de dernière participation à un vote
        uint8 ajournements; // nombre d'ajournements déjà consommés (max 2)
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

    // ---------------------------------------------------------------------
    // Événements
    // ---------------------------------------------------------------------

    event PropositionOuverte(uint256 indexed proposalId, TypeProposition indexed typeProp, address indexed cible);
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
        // TODO — décider comment empêcher deux Loups d'ouvrir simultanément
        // deux propositions de titularisation pour le même Louveteau
        // (probablement : un mapping "titularisationOuverte" symétrique à
        // _candidatureOuverte, plutôt qu'une nouvelle mécanique).
    }

    /// @notice Ouvre un vote d'exclusion visant un Loup ou un Louveteau (§7.4).
    /// @param membre Adresse du membre visé.
    function proposerExclusion(address membre) external {
        // TODO
    }

    /// @notice Ouvre un vote de dépense de trésorerie (§7.6).
    /// @param beneficiaire Destinataire du transfert si la dépense est votée.
    /// @param montant Montant en wei à transférer.
    /// @param motif Description de la dépense.
    function proposerDepense(address beneficiaire, uint256 montant, string calldata motif) external {
        // TODO
    }

    // ---------------------------------------------------------------------
    // Cycle de vie d'une proposition — vote et exécution (§7.0)
    // ---------------------------------------------------------------------

    /// @notice Vote unique, quel que soit le type de proposition. Réveille le
    ///         votant s'il était dormant (§7.5).
    /// @dev Rejette (ChoixInvalide) un choix Ajourner sur toute proposition
    ///      dont le type n'est pas Titularisation.
    /// @param proposalId Identifiant de la proposition.
    /// @param choix Voir {ChoixVote} pour la sémantique.
    function voter(uint256 proposalId, ChoixVote choix) external {
        if (proposalId >= _prochainProposalId) revert ProposalInconnue();
        Proposition storage prop = _propositions[proposalId];

        if (block.timestamp >= prop.echeance) revert VoteFerme();
        if (_cartes[msg.sender].rang != Rang.Loup) revert PasLoup();
        if (_aVote[proposalId][msg.sender]) revert DejaVote();
        if (choix == ChoixVote.Ajourner && prop.typeProp != TypeProposition.Titularisation) {
            revert ChoixInvalide();
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
        // TODO
    }

    /// @notice Réactive explicitement l'appelant sans attendre qu'une
    ///         proposition passe, afin d'être recompté dans le quorum avant
    ///         qu'une décision ne s'ouvre (§7.5).
    function jeSuisLa() external {
        // TODO
    }

    /// @notice Démission volontaire, immédiate, sans vote (§7.4). Brûle la carte.
    function demissionner() external {
        // TODO
    }

    // ---------------------------------------------------------------------
    // Lecture — propositions, quorum et dormance
    // ---------------------------------------------------------------------

    /// @notice Lecture d'une proposition. Utile aux tests et au front (C7).
    function proposition(uint256 proposalId) external view returns (Proposition memory) {
        return _propositions[proposalId];
    }

    /// @notice Indique si une adresse membre est actuellement dormante
    ///         (Loup sans participation depuis DELAI_DORMANCE). Faux pour un
    ///         Louveteau ou une adresse sans carte : la dormance ne concerne
    ///         que les Loups (§7.5).
    function estDormant(address membre) public view returns (bool) {
        Carte storage carte = _cartes[membre];
        return carte.rang == Rang.Loup && block.timestamp - carte.derniereActivite > DELAI_DORMANCE;
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
        // TODO: revert TransfertInterdit() si from != address(0) && to != address(0)
        return super._update(to, tokenId, auth);
    }

    /// @notice Métadonnées 100% on-chain : JSON + SVG encodés en Base64,
    ///         générés par le contrat, sans dépendance à un serveur ou IPFS (§6).
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        // TODO
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

        emit PropositionOuverte(proposalId, typeProp, cible);
    }

    /// @dev Mint une carte au rang donné. Utilisé pour les fondateurs (rang
    ///      Loup, au déploiement) et pour un candidat admis (rang Louveteau,
    ///      depuis {executer} — pas encore implémenté).
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

    /// @dev Génère le SVG on-chain correspondant à un rang.
    function _svg(Rang rang) private pure returns (string memory) {
        // TODO
    }
}
