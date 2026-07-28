import { ref } from "vue";
import { createPublicClient, createWalletClient, custom, http, getContract, type Address, type Chain } from "viem";
import { sepolia, hardhat } from "viem/chains";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../contract";

// Réseau ciblé : Sepolia par défaut (le déploiement réel et committé), ou
// le nœud Hardhat local pour tester tout le cycle en quelques secondes
// (avance de temps via networkHelpers) plutôt qu'en jours réels. Se
// configure via front/.env.local (jamais committé, cf. *.local dans
// .gitignore) — ne touche jamais contract.ts, qui reste la source de
// vérité du déploiement Sepolia.
// import.meta.env.DEV en plus de VITE_CHAIN : DEV est figé à `false` par
// Vite pour tout `vite build` (production), quel que soit le contenu d'un
// éventuel .env.local présent par erreur — élimination garantie à la
// compilation, pas seulement "ce fichier ne devrait jamais être commité".
const isLocal = import.meta.env.DEV && import.meta.env.VITE_CHAIN === "local";
const chain: Chain = isLocal ? hardhat : sepolia;
// En local, l'adresse n'est pas figée : le panneau de démo (demo/server.mjs)
// redéploie un contrat tout neuf à chaque réinitialisation, donc une
// nouvelle adresse à chaque fois. `let` plutôt que `const` pour pouvoir la
// rafraîchir sans redémarrer le serveur de dev — voir syncLocalContractAddress.
let contractAddress = (import.meta.env.VITE_CONTRACT_ADDRESS as Address | undefined) ?? CONTRACT_ADDRESS;

const DEMO_SERVER_URL = "http://127.0.0.1:4100";

/** Va chercher l'adresse actuelle auprès du panneau de démo. Sans effet en
 *  dehors du mode local — jamais appelé (ni même atteignable) en prod. */
async function syncLocalContractAddress() {
  if (!isLocal) return;
  try {
    const res = await fetch(`${DEMO_SERVER_URL}/api/state`);
    if (!res.ok) return;
    const data = (await res.json()) as { contractAddress?: Address | null };
    if (data.contractAddress) contractAddress = data.contractAddress;
  } catch {
    // Le panneau de démo n'est peut-être pas lancé — pas bloquant, on garde
    // la dernière adresse connue.
  }
}
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

  // Import dynamique pour casser la dépendance circulaire (useMeute importe
  // useWallet pour readOnlyContract/signMessage). Uniquement ici, jamais
  // dans tryRestoreConnection() : la vérification d'appartenance demande
  // une signature, elle ne doit jamais surgir silencieusement à la
  // reconnexion automatique au chargement de la page, seulement sur un
  // clic explicite sur "Connecter mon wallet". C'est aussi ce qui débloque
  // toute la page gouvernance (réservée aux membres) — voir useMeute.ts.
  const { verifierAppartenanceEtCharger } = await import("./useMeute").then((m) => m.useMeute());
  void verifierAppartenanceEtCharger(account);
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
    const nouveauCompte = accounts.length > 0 ? (accounts[0] as Address) : null;
    address.value = nouveauCompte;

    // La session/l'index vérifiés (useMeute) concernaient l'ancien compte —
    // à effacer systématiquement, qu'on se déconnecte ou qu'on bascule sur
    // un autre compte, sans quoi la page restait affichée comme si le
    // nouveau (ou aucun) compte était toujours un membre authentifié
    // (constaté : déconnexion sans effet visible sur la page gouvernance).
    // Import dynamique : même raison qu'en connect() (dépendance
    // circulaire useMeute <-> useWallet).
    void import("./useMeute").then((m) => {
      const { reinitialiserSession, verifierAppartenanceEtCharger } = m.useMeute();
      reinitialiserSession();
      // Un changement de compte explicite dans MetaMask (pas une
      // reconnexion silencieuse au chargement) — redemander une preuve
      // d'appartenance ici est cohérent avec "une signature par session",
      // la session change avec le compte.
      if (nouveauCompte) void verifierAppartenanceEtCharger(nouveauCompte);
    });
  });

  injected.on("chainChanged", (...args: unknown[]) => {
    const chainIdHex = args[0] as string;
    wrongNetwork.value = parseInt(chainIdHex, 16) !== chain.id;
  });
}
attachWalletListeners();

// Sans ça, un rafraîchissement de page affiche "connecter mon wallet" même
// si MetaMask a déjà autorisé ce site — l'autorisation survit au
// rechargement côté wallet, mais `address` (un simple ref en mémoire) est
// remis à zéro à chaque chargement du module. `getAddresses()` (eth_accounts)
// est silencieux, contrairement à `requestAddresses()` (eth_requestAccounts) :
// il ne redemande jamais l'autorisation, juste ce qui a déjà été donné.
async function tryRestoreConnection() {
  const injected = getInjected();
  if (!injected) return;
  try {
    const walletClient = createWalletClient({
      chain,
      transport: custom(injected as Parameters<typeof custom>[0]),
    });
    const [account] = await walletClient.getAddresses();
    if (!account) return;
    address.value = account;
    wrongNetwork.value = (await walletClient.getChainId()) !== chain.id;
  } catch {
    // Wallet verrouillé ou autre souci silencieux — l'utilisateur peut
    // toujours cliquer "Connecter mon wallet" manuellement.
  }
}
tryRestoreConnection();

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

/** Signature d'un message arbitraire (pas une transaction) — utilisé pour
 *  prouver la possession d'un wallet sans dépenser de gas, ex: délier un
 *  compte Discord (voir useDiscordLink.ts). */
async function signMessage(message: string): Promise<`0x${string}`> {
  if (!address.value) throw new Error("Wallet non connecté");
  const injected = (window as unknown as { ethereum: unknown }).ethereum;
  const walletClient = createWalletClient({
    account: address.value,
    chain,
    transport: custom(injected as Parameters<typeof custom>[0]),
  });
  return walletClient.signMessage({ account: address.value, message });
}

export function useWallet() {
  return {
    address,
    wrongNetwork,
    noWalletDetected,
    connect,
    readOnlyContract,
    writableContract,
    signMessage,
    publicClient,
    contractAddress,
    syncLocalContractAddress,
  };
}
