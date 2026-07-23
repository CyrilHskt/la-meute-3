import { ref } from "vue";
import { decodeEventLog, type Address, type Log } from "viem";
import { useWallet } from "./useWallet";
import { CONTRACT_ABI } from "../contract";

// En prod, les stats/propositions viennent d'un instantané JSON statique
// (front/public/dao-index.json) maintenu par un job GitHub Actions
// (scripts/sync-dao.js) plutôt que scannées en direct par chaque visiteur.
// Scanner soi-même tout l'historique du contrat à chaque chargement de
// page se heurtait aux limites d'un RPC gratuit (plage de blocs, débit) et
// n'aurait fait qu'empirer avec le temps — voir la discussion dans
// docs/local/soutenance-prep.md. En local, pas de job qui tourne : on
// scanne en direct comme avant, utile pour tester scripts/seed-local.js.
const isLocal = import.meta.env.VITE_CHAIN === "local";

const BLOCK_RANGE = 9n;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWindowWithRetry<T>(
  fetchWindow: (fromBlock: bigint, toBlock: bigint) => Promise<T[]>,
  fromBlock: bigint,
  toBlock: bigint,
  attempt = 1,
): Promise<T[]> {
  try {
    return await fetchWindow(fromBlock, toBlock);
  } catch (err) {
    const message = String((err as { message?: string })?.message ?? err).toLowerCase();
    const is429 = message.includes("429") || message.includes("rate limit") || message.includes("compute units");
    if (!is429 || attempt >= 5) throw err;
    await sleep(500 * 2 ** (attempt - 1));
    return fetchWindowWithRetry(fetchWindow, fromBlock, toBlock, attempt + 1);
  }
}

async function getAllLogsChunked(
  publicClient: {
    getBlockNumber: () => Promise<bigint>;
    getLogs: (args: { address: Address; fromBlock: bigint; toBlock: bigint }) => Promise<Log[]>;
  },
  address: Address,
  deployBlock: bigint,
): Promise<Log[]> {
  const latest = await publicClient.getBlockNumber();
  const results: Log[] = [];
  for (let from = deployBlock; from <= latest; from += BLOCK_RANGE + 1n) {
    const to = from + BLOCK_RANGE > latest ? latest : from + BLOCK_RANGE;
    results.push(
      ...(await fetchWindowWithRetry((f, t) => publicClient.getLogs({ address, fromBlock: f, toBlock: t }), from, to)),
    );
  }
  return results;
}

interface DecodedEvent {
  eventName: string;
  args: Record<string, unknown>;
}

function decodeContractLogs(logs: Log[]): DecodedEvent[] {
  return logs.flatMap((log) => {
    try {
      const decoded = decodeEventLog({ abi: CONTRACT_ABI, data: log.data, topics: log.topics });
      return [{ eventName: decoded.eventName, args: decoded.args as Record<string, unknown> }];
    } catch {
      return [];
    }
  });
}

export const Rang = { Louveteau: 0, Loup: 1 } as const;
export const TypeProposition = { Admission: 0, Titularisation: 1, Exclusion: 2, Depense: 3 } as const;
export const ChoixVote = { Approuver: 0, Rejeter: 1, Ajourner: 2 } as const;

export interface Carte {
  rang: number;
  derniereActivite: number;
  ajournements: number;
}

export interface Proposal {
  id: bigint;
  typeProp: number;
  cible: Address;
  auteur: Address;
  echeance: bigint;
  snapshotActifs: number;
  snapshotFige: boolean;
  executee: boolean;
  votesApprouver: number;
  votesRejeter: number;
  votesAjourner: number;
  montant: bigint;
  motif: string;
}

export interface Stats {
  treasuryWei: bigint;
  loupsActifs: number;
  loupsDormants: number;
  louveteaux: number;
  votesExprimes: number;
  propositionsOuvertes: number;
}

interface DaoIndex {
  stats: {
    treasuryWei: string;
    loupsActifs: number;
    loupsDormants: number;
    louveteaux: number;
    votesExprimes: number;
    propositionsOuvertes: number;
  };
  proposals: {
    id: string;
    typeProp: number;
    cible: Address;
    auteur: Address;
    echeance: string;
    snapshotActifs: number;
    snapshotFige: boolean;
    executee: boolean;
    votesApprouver: number;
    votesRejeter: number;
    votesAjourner: number;
    montant: string;
    motif: string;
  }[];
  memberActivity: Record<string, { votesSoumis: number; propositionsOuvertes: number }>;
}

const stats = ref<Stats | null>(null);
const proposals = ref<Proposal[]>([]);
const memberActivity = ref<Map<string, { votesSoumis: number; propositionsOuvertes: number }>>(new Map());
const loading = ref(false);
const error = ref<string | null>(null);

export function useMeute() {
  const { readOnlyContract, publicClient, contractAddress, deployBlock } = useWallet();

  async function loadFromIndex() {
    const res = await fetch("/dao-index.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`Impossible de charger l'instantané DAO (HTTP ${res.status})`);
    const index = (await res.json()) as DaoIndex;

    stats.value = { ...index.stats, treasuryWei: BigInt(index.stats.treasuryWei) };

    proposals.value = index.proposals
      .map((p) => ({
        ...p,
        id: BigInt(p.id),
        echeance: BigInt(p.echeance),
        montant: BigInt(p.montant),
      }))
      .sort((a, b) => (a.id > b.id ? -1 : 1));

    memberActivity.value = new Map(Object.entries(index.memberActivity));
  }

  // Scan en direct — seulement en local (cf. commentaire en tête de
  // fichier), où il n'y a pas d'instantané JSON à jour puisqu'aucun job
  // planifié ne tourne contre un nœud Hardhat local éphémère.
  async function loadFromChain() {
    const contract = readOnlyContract();
    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

    const [treasuryWei, loupsActifsCount, rawLogs] = await Promise.all([
      publicClient.getBalance({ address: contractAddress }),
      contract.read.loupsActifs() as Promise<bigint>,
      getAllLogsChunked(publicClient, contractAddress, deployBlock),
    ]);
    const decoded = decodeContractLogs(rawLogs);
    const openedLogs = decoded.filter((d) => d.eventName === "PropositionOuverte");
    const voteLogs = decoded.filter((d) => d.eventName === "VoteExprime");
    const executedLogs = decoded.filter((d) => d.eventName === "PropositionExecutee");
    const transferLogs = decoded.filter((d) => d.eventName === "Transfer");
    const mintLogs = transferLogs.filter((d) => (d.args as { from: Address }).from.toLowerCase() === ZERO_ADDRESS);
    const burnLogs = transferLogs.filter((d) => (d.args as { to: Address }).to.toLowerCase() === ZERO_ADDRESS);

    const minted = new Set(mintLogs.map((l) => (l.args as { to: Address }).to.toLowerCase()));
    const burned = new Set(burnLogs.map((l) => (l.args as { from: Address }).from.toLowerCase()));
    const currentMembers = [...minted].filter((a) => !burned.has(a)) as Address[];

    let cartes: Carte[];
    if (currentMembers.length === 0) {
      cartes = [];
    } else {
      try {
        cartes = (await publicClient.multicall({
          contracts: currentMembers.map((addr) => ({
            address: contractAddress,
            abi: CONTRACT_ABI,
            functionName: "carte",
            args: [addr],
          })),
          allowFailure: false,
        })) as unknown as Carte[];
      } catch {
        cartes = await Promise.all(currentMembers.map((addr) => contract.read.carte([addr]) as Promise<Carte>));
      }
    }

    let louveteaux = 0;
    let loupsDormants = 0;
    const now = Number((await publicClient.getBlock()).timestamp);
    const DELAI_DORMANCE = 365 * 24 * 60 * 60;

    cartes.forEach((c) => {
      if (c.rang === Rang.Louveteau) {
        louveteaux++;
      } else if (now - c.derniereActivite > DELAI_DORMANCE) {
        loupsDormants++;
      }
    });

    stats.value = {
      treasuryWei,
      loupsActifs: Number(loupsActifsCount),
      loupsDormants,
      louveteaux,
      votesExprimes: voteLogs.length,
      propositionsOuvertes: openedLogs.length - executedLogs.length,
    };

    const propsRaw = await Promise.all(
      openedLogs.map(async (log) => {
        const args = log.args as { proposalId: bigint; cible: Address; auteur: Address };
        const p = (await contract.read.proposition([args.proposalId])) as Omit<Proposal, "id" | "auteur">;
        return { ...p, id: args.proposalId, auteur: args.auteur } as Proposal;
      }),
    );
    proposals.value = propsRaw.sort((a, b) => (a.id > b.id ? -1 : 1));

    const activity = new Map<string, { votesSoumis: number; propositionsOuvertes: number }>();
    const bump = (addr: string, key: "votesSoumis" | "propositionsOuvertes") => {
      const k = addr.toLowerCase();
      const entry = activity.get(k) ?? { votesSoumis: 0, propositionsOuvertes: 0 };
      entry[key]++;
      activity.set(k, entry);
    };
    voteLogs.forEach((l) => bump((l.args as { votant: Address }).votant, "votesSoumis"));
    openedLogs.forEach((l) => bump((l.args as { auteur: Address }).auteur, "propositionsOuvertes"));
    memberActivity.value = activity;
  }

  async function loadAll() {
    loading.value = true;
    error.value = null;
    try {
      if (isLocal) {
        await loadFromChain();
      } else {
        await loadFromIndex();
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  return { stats, proposals, memberActivity, loading, error, loadAll };
}
