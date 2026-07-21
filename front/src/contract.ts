// Adresse et ABI copiées depuis artifacts/contracts/Meute.sol/Meute.json
// après compilation (`npx hardhat compile` à la racine du dépôt).
// À régénérer manuellement si le contrat change.
//
// Le front et le contrat ont chacun leur propre version (tags séparés
// contract-vX.Y.Z / front-vA.B.C, cf. .github/workflows/) : rien n'oblige
// leurs numéros à matcher. Le vrai lien de compatibilité, c'est cette
// constante : elle documente quelle version du contrat ce build du front
// cible réellement, à mettre à jour à chaque redéploiement.
export const CONTRACT_VERSION = "0.1.0" as const;

export const CONTRACT_ADDRESS = "0xc46afFe7d978B16d185671433D94e2642aadC2c8" as const;

// Bloc de déploiement (ignition/deployments/chain-11155111/journal.jsonl) :
// point de départ des requêtes de logs, pour ne jamais interroger depuis le
// bloc 0 — les RPC publics plafonnent la plage `eth_getLogs` (10 000 blocs
// sur celui utilisé ici), et le contrat n'a de toute façon aucune activité
// avant ce bloc.
export const CONTRACT_DEPLOY_BLOCK = 11319851n;

export const CONTRACT_ABI = [
  {
    "inputs": [
      {
        "internalType": "address[]",
        "name": "fondateurs",
        "type": "address[]"
      },
      {
        "internalType": "uint256",
        "name": "montantCotisation",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "AucunFondateur",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "CandidatureDejaOuverte",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ChoixInvalide",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "CotisationIncorrecte",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "DejaExecutee",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "DejaMembre",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "DejaVote",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "sender",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      }
    ],
    "name": "ERC721IncorrectOwner",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "operator",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      }
    ],
    "name": "ERC721InsufficientApproval",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "approver",
        "type": "address"
      }
    ],
    "name": "ERC721InvalidApprover",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "operator",
        "type": "address"
      }
    ],
    "name": "ERC721InvalidOperator",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      }
    ],
    "name": "ERC721InvalidOwner",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "receiver",
        "type": "address"
      }
    ],
    "name": "ERC721InvalidReceiver",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "sender",
        "type": "address"
      }
    ],
    "name": "ERC721InvalidSender",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      }
    ],
    "name": "ERC721NonexistentToken",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "FondsInsuffisants",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "MontantInvalide",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "PasCandidat",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "PasLoup",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "PasLouveteau",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "PasMembre",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ProbationNonTerminee",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ProposalInconnue",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ReentrancyGuardReentrantCall",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "value",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "length",
        "type": "uint256"
      }
    ],
    "name": "StringsInsufficientHexLength",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "TitularisationDejaOuverte",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "TransfertEchoue",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "TransfertInterdit",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "VoteEncoreOuvert",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "VoteFerme",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "owner",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "approved",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      }
    ],
    "name": "Approval",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "owner",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "operator",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "approved",
        "type": "bool"
      }
    ],
    "name": "ApprovalForAll",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "membre",
        "type": "address"
      }
    ],
    "name": "MembreReveille",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "proposalId",
        "type": "uint256"
      }
    ],
    "name": "PropositionExecutee",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "proposalId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "cible",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "auteur",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "enum Meute.TypeProposition",
        "name": "typeProp",
        "type": "uint8"
      }
    ],
    "name": "PropositionOuverte",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "from",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "to",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      }
    ],
    "name": "Transfer",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "proposalId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "votant",
        "type": "address"
      }
    ],
    "name": "VoteExprime",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "AJOURNEMENTS_MAX",
    "outputs": [
      {
        "internalType": "uint8",
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "DELAI_DORMANCE",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "DUREE_PROBATION",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "DUREE_VOTE",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "VERSION",
    "outputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "to",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      }
    ],
    "name": "approve",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      }
    ],
    "name": "balanceOf",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "candidater",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "membre",
        "type": "address"
      }
    ],
    "name": "carte",
    "outputs": [
      {
        "components": [
          {
            "internalType": "enum Meute.Rang",
            "name": "rang",
            "type": "uint8"
          },
          {
            "internalType": "uint40",
            "name": "derniereActivite",
            "type": "uint40"
          },
          {
            "internalType": "uint8",
            "name": "ajournements",
            "type": "uint8"
          }
        ],
        "internalType": "struct Meute.Carte",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "cotisation",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "demissionner",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "membre",
        "type": "address"
      }
    ],
    "name": "estDormant",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "proposalId",
        "type": "uint256"
      }
    ],
    "name": "executer",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      }
    ],
    "name": "getApproved",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "operator",
        "type": "address"
      }
    ],
    "name": "isApprovedForAll",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "jeSuisLa",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "loupsActifs",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "actifs",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "name",
    "outputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "louveteau",
        "type": "address"
      }
    ],
    "name": "ouvrirTitularisation",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      }
    ],
    "name": "ownerOf",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "beneficiaire",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "montant",
        "type": "uint256"
      },
      {
        "internalType": "string",
        "name": "motif",
        "type": "string"
      }
    ],
    "name": "proposerDepense",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "membre",
        "type": "address"
      }
    ],
    "name": "proposerExclusion",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "proposalId",
        "type": "uint256"
      }
    ],
    "name": "proposition",
    "outputs": [
      {
        "components": [
          {
            "internalType": "enum Meute.TypeProposition",
            "name": "typeProp",
            "type": "uint8"
          },
          {
            "internalType": "address",
            "name": "cible",
            "type": "address"
          },
          {
            "internalType": "uint64",
            "name": "echeance",
            "type": "uint64"
          },
          {
            "internalType": "uint32",
            "name": "snapshotActifs",
            "type": "uint32"
          },
          {
            "internalType": "bool",
            "name": "snapshotFige",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "executee",
            "type": "bool"
          },
          {
            "internalType": "uint32",
            "name": "votesApprouver",
            "type": "uint32"
          },
          {
            "internalType": "uint32",
            "name": "votesRejeter",
            "type": "uint32"
          },
          {
            "internalType": "uint32",
            "name": "votesAjourner",
            "type": "uint32"
          },
          {
            "internalType": "uint256",
            "name": "montant",
            "type": "uint256"
          },
          {
            "internalType": "string",
            "name": "motif",
            "type": "string"
          }
        ],
        "internalType": "struct Meute.Proposition",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "from",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "to",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      }
    ],
    "name": "safeTransferFrom",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "from",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "to",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      },
      {
        "internalType": "bytes",
        "name": "data",
        "type": "bytes"
      }
    ],
    "name": "safeTransferFrom",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "operator",
        "type": "address"
      },
      {
        "internalType": "bool",
        "name": "approved",
        "type": "bool"
      }
    ],
    "name": "setApprovalForAll",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes4",
        "name": "interfaceId",
        "type": "bytes4"
      }
    ],
    "name": "supportsInterface",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "symbol",
    "outputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      }
    ],
    "name": "tokenURI",
    "outputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "from",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "to",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      }
    ],
    "name": "transferFrom",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "proposalId",
        "type": "uint256"
      },
      {
        "internalType": "enum Meute.ChoixVote",
        "name": "choix",
        "type": "uint8"
      }
    ],
    "name": "voter",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;
