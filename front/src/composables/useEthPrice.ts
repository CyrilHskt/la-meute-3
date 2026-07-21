import { ref } from "vue";

// Affichage front uniquement, jamais consommé par le contrat : un simple
// appel à une API publique suffit, pas besoin d'oracle on-chain (celui-ci
// ne serait nécessaire que si le *contrat* devait connaître le cours).
const eurPerEth = ref<number | null>(null);

let fetched = false;

async function fetchOnce() {
  if (fetched) return;
  fetched = true;
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=eur");
    const data = (await res.json()) as { ethereum?: { eur?: number } };
    eurPerEth.value = data.ethereum?.eur ?? null;
  } catch {
    eurPerEth.value = null;
  }
}

export function useEthPrice() {
  void fetchOnce();
  return { eurPerEth };
}
