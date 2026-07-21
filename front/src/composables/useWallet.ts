import { ref } from "vue";
import { createPublicClient, createWalletClient, custom, http, getContract, type Address } from "viem";
import { sepolia } from "viem/chains";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../contract";

const address = ref<Address | null>(null);
const wrongNetwork = ref(false);

// Lecture seule : ne nécessite aucun wallet, fonctionne même pour un
// visiteur sans MetaMask installé — RPC public de la chaîne, pas de clé
// nécessaire pour lire. Ne pas utiliser `custom(window.ethereum)` ici :
// ça exigerait un wallet juste pour afficher des stats publiques.
const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(),
});

async function connect() {
  const injected = (window as unknown as { ethereum?: unknown }).ethereum;
  if (!injected) {
    alert("Aucun wallet détecté. Installe MetaMask (ou équivalent) pour continuer.");
    return;
  }

  const walletClient = createWalletClient({
    chain: sepolia,
    transport: custom(injected as Parameters<typeof custom>[0]),
  });

  const [account] = await walletClient.requestAddresses();
  const chainId = await walletClient.getChainId();

  address.value = account;
  wrongNetwork.value = chainId !== sepolia.id;
}

/** Contrat en lecture seule (view) : fonctionne sans wallet connecté. */
function readOnlyContract() {
  return getContract({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, client: publicClient });
}

/** Contrat signé : nécessite un wallet connecté, pour les fonctions qui écrivent. */
function writableContract() {
  if (!address.value) throw new Error("Wallet non connecté");
  const injected = (window as unknown as { ethereum: unknown }).ethereum;
  const walletClient = createWalletClient({
    account: address.value,
    chain: sepolia,
    transport: custom(injected as Parameters<typeof custom>[0]),
  });
  return getContract({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, client: walletClient });
}

export function useWallet() {
  return { address, wrongNetwork, connect, readOnlyContract, writableContract, publicClient };
}
