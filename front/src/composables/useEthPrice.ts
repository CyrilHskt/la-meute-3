import { ref } from "vue";

// Front-end display only, never consumed by the contract: a plain call to
// a public API is enough, no need for an on-chain oracle (that would only
// be necessary if the *contract* needed to know the price).
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
