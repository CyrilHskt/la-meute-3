<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import type { Address } from "viem";
import { useWallet } from "../../composables/useWallet";
import { useMeute, TypeProposition, type Member } from "../../composables/useMeute";
import { useDiscordLink } from "../../composables/useDiscordLink";
import { useToast } from "../../composables/useToast";
import { friendlyContractError } from "../../composables/contractErrors";
import { useLocalAutoRefresh } from "../../composables/useLocalAutoRefresh";
import AddressChip from "./AddressChip.vue";

const { address, connect, readOnlyContract, writableContract, publicClient } = useWallet();
const { members, proposals, loading, error, estAutorise, loadAll } = useMeute();

// Marqueur purement front (jamais une vraie valeur de Rang côté contrat, qui
// n'a que Louveteau=0/Loup=1) : un candidat n'a pas encore de carte du tout,
// juste une proposition d'Admission ouverte — on le mélange quand même dans
// la liste des membres (on joue déjà avec eux en pratique), sans actions
// titulariser/exclure puisqu'il se vote via sa propre candidature.
const RANG_CANDIDAT = -1;
const { discordLinkFor } = useDiscordLink();
const { showToast } = useToast();

// Rôle du visiteur courant — pas exposé par useMeute (qui décrit les
// membres en général, pas "moi" en particulier) : une lecture ciblée
// suffit, pas besoin de dupliquer toute la logique de GouvernanceDao.vue.
const monRang = ref<number | null>(null);
async function chargerMonRang() {
  if (!address.value) {
    monRang.value = null;
    return;
  }
  const balance = (await readOnlyContract().read.balanceOf([address.value])) as bigint;
  if (balance === 0n) {
    monRang.value = null;
    return;
  }
  const carte = (await readOnlyContract().read.carte([address.value])) as { rang: number };
  monRang.value = Number(carte.rang);
}
const jeSuisLoup = computed(() => monRang.value === 1);

onMounted(async () => {
  await loadAll();
  chargerMonRang();
});
watch(address, chargerMonRang);

// Voir GouvernanceDao.vue : sans remettre le scroll à 0 quand la liste des
// membres disparaît (déconnexion), la position de scroll reste celle
// d'avant sur une page bien plus courte.
watch(estAutorise, (autorise) => {
  if (!autorise) window.scrollTo({ top: 0 });
});

// Mode démo locale uniquement — voir GouvernanceDao.vue pour le contexte
// (le panneau de démo modifie l'état dans un autre onglet, sans prévenir
// celui-ci).
useLocalAutoRefresh(async () => {
  await loadAll();
  await chargerMonRang();
});

interface Ligne extends Member {
  pseudo?: string;
  avatarUrl?: string;
}

const recherche = ref("");
const lignes = computed<Ligne[]>(() => {
  const q = recherche.value.trim().toLowerCase();

  const candidats: Ligne[] = proposals.value
    .filter((p) => p.typeProp === TypeProposition.Admission && !p.executee)
    .map((p) => ({ address: p.cible, rang: RANG_CANDIDAT, dormant: false }));

  return [...members.value, ...candidats]
    .map((m) => {
      const link = discordLinkFor(m.address);
      return { ...m, pseudo: link?.pseudo, avatarUrl: link?.avatarUrl };
    })
    .filter((m) => !q || (m.pseudo ?? "").toLowerCase().includes(q) || m.address.toLowerCase().includes(q))
    .sort((a, b) => (a.pseudo ?? a.address).localeCompare(b.pseudo ?? b.address));
});

type ActionType = "titulariser" | "exclure";
const confirmation = ref<{ type: ActionType; membre: Ligne } | null>(null);
const txPending = ref(false);
const txError = ref<string | null>(null);

function demander(type: ActionType, membre: Ligne) {
  txError.value = null;
  confirmation.value = { type, membre };
}
function annuler() {
  confirmation.value = null;
  txError.value = null;
}

// GouvernanceDao.vue et GouvernanceDons.vue passent déjà par un handler qui
// affiche l'erreur — cette page appelait `connect` brut, donc un clic
// annulé sur le popup MetaMask partait en rejet de promesse non géré, sans
// aucun retour visible à l'utilisateur.
async function onConnect() {
  txError.value = null;
  try {
    await connect();
  } catch (e) {
    txError.value = friendlyContractError(e);
  }
}

async function confirmer() {
  if (!confirmation.value) return;
  const { type, membre } = confirmation.value;
  const cible = membre.address as Address;
  txPending.value = true;
  txError.value = null;
  try {
    if (type === "titulariser") {
      await readOnlyContract().simulate.ouvrirTitularisation([cible], { account: address.value! });
      const hash = await writableContract().write.ouvrirTitularisation([cible]);
      await publicClient.waitForTransactionReceipt({ hash });
    } else {
      await readOnlyContract().simulate.proposerExclusion([cible], { account: address.value! });
      const hash = await writableContract().write.proposerExclusion([cible]);
      await publicClient.waitForTransactionReceipt({ hash });
    }
    showToast(type === "titulariser" ? "Titularisation proposée" : "Exclusion proposée");
    confirmation.value = null;
    await loadAll();
  } catch (e) {
    txError.value = friendlyContractError(e);
  } finally {
    txPending.value = false;
  }
}
</script>

<template>
  <div class="gm-page">
    <h2 class="gm-title">Membres de la Meute</h2>

    <div v-if="!estAutorise" class="gm-gate">
      <p class="gm-gate-text">
        La liste des membres est réservée aux Loups et Louveteaux de la Meute — connecte le wallet que tu utilises
        pour voter afin de la consulter.
      </p>
      <button class="btn btn-primary" type="button" @click="onConnect">Connecter mon wallet</button>
      <p v-if="txError" class="gm-error">{{ txError }}</p>
    </div>

    <template v-else>
      <p class="gm-intro">
        {{ lignes.length }} membre{{ lignes.length > 1 ? "s" : "" }} — Loups, Louveteaux et candidatures en cours.
      </p>

      <p v-if="loading" class="gm-status">Chargement des données on-chain…</p>
      <p v-else-if="error" class="gm-status gm-status--error">
        Erreur de lecture : {{ error }} — la liste ci-dessous peut être incomplète.
      </p>

      <div class="gm-search-wrap">
      <svg class="gm-search-icon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
        <circle cx="7" cy="7" r="4.5" />
        <path d="M13.5 13.5 10.6 10.6" stroke-linecap="round" />
      </svg>
      <input v-model="recherche" class="gm-search" type="text" placeholder="Rechercher un membre…" />
    </div>

    <ul class="gm-list">
      <li v-for="m in lignes" :key="m.address" class="gm-row">
        <img v-if="m.avatarUrl" class="gm-avatar" :src="m.avatarUrl" alt="" />
        <span v-else class="gm-avatar gm-avatar--placeholder" aria-hidden="true"></span>

        <div class="gm-identity">
          <span v-if="m.pseudo" class="gm-pseudo">{{ m.pseudo }}</span>
          <span v-else class="gm-pseudo gm-pseudo--none">Discord non lié</span>
          <AddressChip :address="m.address" short address-only dark />
        </div>

        <span
          v-if="m.rang === -1"
          class="gm-badge gm-badge--candidat"
          title="Candidature d'admission en cours de vote"
        >
          Candidat
        </span>
        <span
          v-else
          class="gm-badge"
          :class="[`gm-badge--${m.rang === 0 ? 'louveteau' : 'loup'}`, { 'gm-badge--dormant': m.dormant }]"
        >
          {{ m.rang === 0 ? "Louveteau" : "Loup" }}{{ m.dormant ? " · dormant" : "" }}
        </span>

        <div
          v-if="jeSuisLoup && m.rang !== -1 && m.address.toLowerCase() !== address?.toLowerCase()"
          class="gm-actions"
        >
          <button
            v-if="m.rang === 0"
            class="gm-action gm-action--up"
            type="button"
            title="Proposer la titularisation"
            @click="demander('titulariser', m)"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M8 12.5V3.5M4 7.5 8 3.5l4 4" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
          <button
            class="gm-action gm-action--x"
            type="button"
            title="Proposer l'exclusion"
            @click="demander('exclure', m)"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M4 4l8 8M12 4l-8 8" stroke-linecap="round" />
            </svg>
          </button>
        </div>
      </li>
      <li v-if="!lignes.length" class="gm-empty">Aucun membre trouvé.</li>
      </ul>

      <div v-if="confirmation" class="gm-overlay" @click.self="annuler">
        <div class="gm-modal">
          <p class="gm-modal-title">
            {{ confirmation.type === "titulariser" ? "Proposer la titularisation de" : "Proposer l'exclusion de" }}
            <strong>{{ confirmation.membre.pseudo ?? confirmation.membre.address }}</strong> ?
          </p>
          <p class="gm-modal-note">Les Loups actifs voteront ensuite pendant 7 jours.</p>
          <p v-if="txError" class="gm-error">{{ txError }}</p>
          <div class="gm-modal-actions">
            <button class="btn btn-outline" type="button" :disabled="txPending" @click="annuler">Annuler</button>
            <button class="btn btn-primary" type="button" :disabled="txPending" @click="confirmer">
              {{ txPending ? "En cours…" : "Confirmer" }}
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.gm-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 2.5rem 1.5rem 4rem;
}

.gm-title {
  color: $color-orange;
  font-family: $font-display;
  text-transform: uppercase;
  letter-spacing: 1px;
  font-size: $fs-section-title;
  margin: 0 0 0.4rem;
}

.gm-intro {
  color: rgba(255, 255, 255, 0.75);
  font-size: $fs-body;
  margin: 0 0 1.5rem;
}

.gm-gate {
  padding: 2rem 1.5rem;
  text-align: center;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
}

.gm-gate-text {
  color: rgba(255, 255, 255, 0.75);
  font-size: $fs-body;
  margin: 0 0 1.2rem;
}

.gm-status {
  color: rgba(255, 255, 255, 0.75);
  font-size: $fs-caption;
  margin: -0.8rem 0 1.2rem;

  &--error {
    color: #e05a47;
  }
}

.gm-search-wrap {
  position: relative;
  margin: 1.5rem 0;
}

.gm-search-icon {
  position: absolute;
  top: 50%;
  left: 0.85rem;
  transform: translateY(-50%);
  color: rgba(255, 255, 255, 0.45);
  pointer-events: none;
}

.gm-search {
  width: 100%;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  padding: 0.65rem 0.9rem 0.65rem 2.3rem;
  font: inherit;
  font-size: $fs-body;
  color: #fff;

  &::placeholder {
    color: rgba(255, 255, 255, 0.4);
  }

  &:focus {
    outline: none;
    border-color: $color-orange;
    box-shadow: 0 0 0 3px rgba(249, 174, 60, 0.18);
  }
}

// Rangées translucides sur le fond noir du dashboard plutôt qu'une seule
// dalle blanche opaque — la liste fait alors partie du dashboard sombre au
// lieu de flotter dessus comme une page à part (retour d'un agent UX).
.gm-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.gm-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.85rem 1.1rem;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  transition: background 0.15s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.07);
  }

  // Les actions ne prennent leur plein poids visuel qu'au survol de la
  // ligne — sinon 2 icônes x N lignes rivalisent avec les pseudos à la
  // lecture (retour d'un agent UX).
  &:hover .gm-action,
  &:focus-within .gm-action {
    opacity: 1;
  }
}

.gm-empty {
  padding: 1.5rem;
  text-align: center;
  color: rgba(255, 255, 255, 0.55);
  font-size: $fs-caption;
}

.gm-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  flex-shrink: 0;
  border: 2px solid rgba(255, 255, 255, 0.15);

  &--placeholder {
    background: rgba(255, 255, 255, 0.06);
  }
}

.gm-identity {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  min-width: 0;
  flex: 1;
}

.gm-pseudo {
  font-weight: 700;
  font-size: $fs-body;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &--none {
    font-weight: 400;
    font-style: italic;
    color: rgba(255, 255, 255, 0.45);
  }
}

.gm-badge {
  flex-shrink: 0;
  // Largeur fixe plutôt qu'au contenu : "Loup", "Louveteau · dormant" et
  // "Candidat" n'ont pas la même longueur, et les laisser au contenu
  // décalait les icônes d'action d'une ligne à l'autre (retour utilisateur).
  width: 150px;
  text-align: center;
  font-size: $fs-caption;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  padding: 0.4rem 0.6rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.6);

  &--loup {
    background: rgba(232, 146, 90, 0.18);
    color: #e8925a;
  }
  &--louveteau {
    background: rgba(199, 159, 224, 0.18);
    color: #c79fe0;
  }
  // Rôle assourdi plutôt qu'un badge séparé — "Loup dormant" reste un Loup,
  // pas une deuxième info disjointe (retour d'un agent UX).
  &--dormant {
    opacity: 0.55;
  }
  &--candidat {
    background: rgba(249, 174, 60, 0.18);
    color: $color-orange;
  }
}

.gm-actions {
  display: flex;
  gap: 0.4rem;
  flex-shrink: 0;
}

.gm-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  opacity: 0.55;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;

  &:hover {
    opacity: 1;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.3 !important;
  }

  &--up:hover:not(:disabled) {
    background: rgba(46, 158, 91, 0.16);
    border-color: #2e9e5b;
    color: #2e9e5b;
  }
  &--x:hover {
    background: rgba(192, 57, 43, 0.14);
    border-color: #e05a47;
    color: #e05a47;
  }
}

.gm-overlay {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(10, 10, 10, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}

.gm-modal {
  background: $color-card-bg;
  border-radius: 6px;
  padding: 1.8rem;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.25);
}

.gm-modal-title {
  font-size: $fs-h4;
  color: $color-black;
  margin: 0 0 0.6rem;
}

.gm-modal-note {
  font-size: $fs-caption;
  color: $color-text-dim;
  margin: 0 0 1.2rem;
}

.gm-error {
  font-size: $fs-caption;
  color: #c0392b;
  margin: 0 0 1rem;
}

.gm-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
}
</style>
