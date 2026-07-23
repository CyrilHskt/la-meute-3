import { ref } from "vue";
import { createPublicClient, createWalletClient, custom, http, getContract, type Address, type Chain } from "viem";
import { sepolia, hardhat } from "viem/chains";
import { CONTRACT_ADDRESS, CONTRACT_ABI, CONTRACT_DEPLOY_BLOCK } from "../contract";

// Réseau ciblé : Sepolia par défaut (le déploiement réel et committé), ou
// le nœud Hardhat local pour tester tout le cycle en quelques secondes
// (avance de temps via networkHelpers) plutôt qu'en jours réels. Se
// configure via front/.env.local (jamais committé, cf. *.local dans
// .gitignore) — ne touche jamais contract.ts, qui reste la source de
// vérité du déploiement Sepolia.
const isLocal = import.meta.env.VITE_CHAIN === "local";
const chain: Chain = isLocal ? hardhat : sepolia;
const contractAddress = (import.meta.env.VITE_CONTRACT_ADDRESS as Address | undefined) ?? CONTRACT_ADDRESS;
// Un nœud Hardhat local repart toujours du bloc 0 : le bloc de déploiement
// Sepolia (~11M) n'a aucun sens là-dessus et ferait chercher des
// événements depuis un bloc qui n'existe pas encore sur cette chaîne.
const deployBlock = isLocal ? 0n : CONTRACT_DEPLOY_BLOCK;

const address = ref<Address | null>(null);
const wrongNetwork = ref(false);
const noWalletDetected = ref(false);

// Lecture seule : ne nécessite aucun wallet, fonctionne même pour un
// visiteur sans MetaMask installé. Ne pas utiliser `custom(window.ethereum)`
// ici : ça exigerait un wallet juste pour afficher des stats publiques.
//
// VITE_RPC_URL (Alchemy) plutôt que le RPC public par défaut de viem :
// ce dernier (thirdweb pour Sepolia) s'est montré capricieux en prod avec
// la croissance du trafic (échecs réseau intermittents constatés
// directement dans le navigateur, invisibles en local/CLI) — pas de clé
// secrète à protéger ici, une clé RPC en lecture n'autorise aucune
// transaction, seulement à restreindre par domaine dans Alchemy si besoin.
const publicClient = createPublicClient({
  chain,
  transport: http(import.meta.env.VITE_RPC_URL as string | undefined),
});

function getInjected() {
  return (window as unknown as { ethereum?: Record<string, unknown> }).ethereum;
}

async function connect() {
  const injected = getInjected();
  if (!injected) {
    noWalletDetected.value = true;
    return;
  }
  noWalletDetected.value = false;
  attachWalletListeners();

  const walletClient = createWalletClient({
    chain,
    transport: custom(injected as Parameters<typeof custom>[0]),
  });

  const [account] = await walletClient.requestAddresses();
  const chainId = await walletClient.getChainId();

  address.value = account;
  wrongNetwork.value = chainId !== chain.id;
}

// Sans ça, changer de compte ou de réseau *après* le clic sur "Connecter"
// laisse le front bloqué sur son ancien état (ex: "mauvais réseau" qui ne
// se corrige jamais tout seul) — MetaMask ne recharge pas la page pour
// nous, il faut écouter ses événements explicitement.
let listenersAttached = false;
function attachWalletListeners() {
  if (listenersAttached) return;
  const injected = getInjected() as { on?: (event: string, cb: (...args: unknown[]) => void) => void } | undefined;
  if (!injected?.on) return;
  listenersAttached = true;

  injected.on("accountsChanged", (...args: unknown[]) => {
    const accounts = args[0] as string[];
    address.value = accounts.length > 0 ? (accounts[0] as Address) : null;
  });

  injected.on("chainChanged", (...args: unknown[]) => {
    const chainIdHex = args[0] as string;
    wrongNetwork.value = parseInt(chainIdHex, 16) !== chain.id;
  });
}
attachWalletListeners();

/** Contrat en lecture seule (view) : fonctionne sans wallet connecté. */
function readOnlyContract() {
  return getContract({ address: contractAddress, abi: CONTRACT_ABI, client: publicClient });
}

/** Contrat signé : nécessite un wallet connecté, pour les fonctions qui écrivent. */
function writableContract() {
  if (!address.value) throw new Error("Wallet non connecté");
  const injected = (window as unknown as { ethereum: unknown }).ethereum;
  const walletClient = createWalletClient({
    account: address.value,
    chain,
    transport: custom(injected as Parameters<typeof custom>[0]),
  });
  return getContract({ address: contractAddress, abi: CONTRACT_ABI, client: walletClient });
}

export function useWallet() {
  return {
    address,
    wrongNetwork,
    noWalletDetected,
    connect,
    readOnlyContract,
    writableContract,
    publicClient,
    contractAddress,
    deployBlock,
  };
}
