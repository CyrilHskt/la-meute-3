import { ref } from "vue";
import type { Address } from "viem";
import { useWallet } from "./useWallet";

// Les RPC publics (dont celui utilisé par défaut par viem sur Sepolia)
// plafonnent la plage `eth_getLogs` à 10 000 blocs par requête. Ce plafond
// sera dépassé au bout d'environ 33h de vie du contrat (blocs ~12s) — donc
// pas une hypothèse théorique, un vrai découpage en fenêtres est
// nécessaire dès maintenant, pas seulement "au cas où". Sans effet sur un
// nœud local (peu de blocs), juste des fenêtres inutiles mais inoffensives.
const BLOCK_RANGE = 9_000n;

async function getEventsChunked<T>(
  publicClient: { getBlockNumber: () => Promise<bigint> },
  deployBlock: bigint,
  fetchWindow: (fromBlock: bigint, toBlock: bigint) => Promise<T[]>,
): Promise<T[]> {
  const latest = await publicClient.getBlockNumber();
  const windows: Promise<T[]>[] = [];
  for (let from = deployBlock; from <= latest; from += BLOCK_RANGE + 1n) {
    const to = from + BLOCK_RANGE > latest ? latest : from + BLOCK_RANGE;
    windows.push(fetchWindow(from, to));
  }
  return (await Promise.all(windows)).flat();
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

const stats = ref<Stats | null>(null);
const proposals = ref<Proposal[]>([]);
const memberActivity = ref<Map<string, { votesSoumis: number; propositionsOuvertes: number }>>(new Map());
const loading = ref(false);
const error = ref<string | null>(null);

export function useMeute() {
  const { readOnlyContract, publicClient, contractAddress, deployBlock } = useWallet();

  async function loadAll() {
    loading.value = true;
    error.value = null;
    try {
      const contract = readOnlyContract();
      const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

      const [treasuryWei, loupsActifsCount, openedLogs, voteLogs, executedLogs, mintLogs, burnLogs] =
        await Promise.all([
          publicClient.getBalance({ address: contractAddress }),
          contract.read.loupsActifs() as Promise<bigint>,
          getEventsChunked(publicClient, deployBlock, (fromBlock, toBlock) =>
            contract.getEvents.PropositionOuverte({}, { fromBlock, toBlock }),
          ),
          getEventsChunked(publicClient, deployBlock, (fromBlock, toBlock) =>
            contract.getEvents.VoteExprime({}, { fromBlock, toBlock }),
          ),
          getEventsChunked(publicClient, deployBlock, (fromBlock, toBlock) =>
            contract.getEvents.PropositionExecutee({}, { fromBlock, toBlock }),
          ),
          getEventsChunked(publicClient, deployBlock, (fromBlock, toBlock) =>
            contract.getEvents.Transfer({ from: ZERO_ADDRESS }, { fromBlock, toBlock }),
          ),
          getEventsChunked(publicClient, deployBlock, (fromBlock, toBlock) =>
            contract.getEvents.Transfer({ to: ZERO_ADDRESS }, { fromBlock, toBlock }),
          ),
        ]);

      // Membres actuels = adresses mintées moins celles brûlées depuis
      // (démission ou exclusion) — le rang courant, lui, se lit toujours
      // on-chain via carte(), un Transfer ne capture pas une titularisation.
      const minted = new Set(mintLogs.map((l) => (l.args as { to: Address }).to.toLowerCase()));
      const burned = new Set(burnLogs.map((l) => (l.args as { from: Address }).from.toLowerCase()));
      const currentMembers = [...minted].filter((a) => !burned.has(a)) as Address[];

      const cartes = await Promise.all(
        currentMembers.map((addr) => contract.read.carte([addr]) as Promise<Carte>),
      );

      let louveteaux = 0;
      let loupsDormants = 0;
      // L'heure du navigateur (Date.now()) n'a rien à voir avec l'horloge
      // de la chaîne dès qu'on manipule le temps sur un nœud local
      // (evm_increaseTime) : il faut lire le timestamp du dernier bloc, le
      // seul qui compte pour block.timestamp côté contrat.
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
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  return { stats, proposals, memberActivity, loading, error, loadAll };
}
