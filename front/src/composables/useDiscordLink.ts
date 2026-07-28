import { ref } from "vue";
import type { Address } from "viem";
import { useWallet } from "./useWallet";

export interface DiscordLink {
  discordId: string;
  pseudo: string;
  avatarUrl: string;
  linkedAt: string;
}

// Même principe que useMeute.ts : en local (panneau de démo), la source de
// vérité est le serveur de démo (demo/server.mjs), qui fait le même vrai
// flux OAuth Discord que la prod (voir demo/server.mjs, réplique de
// netlify/functions/discord-link.mts) — juste avec un lien stocké en
// mémoire, remis à zéro à chaque reset de scénario plutôt que dans Netlify
// Blobs. DEV, pas seulement VITE_CHAIN : voir useMeute.ts pour le détail.
const isLocal = import.meta.env.DEV && import.meta.env.VITE_CHAIN === "local";
const DEMO_SERVER_URL = "http://127.0.0.1:4100";
const UNLINK_URL = isLocal ? `${DEMO_SERVER_URL}/discord/unlink` : "/.netlify/functions/discord-link?action=unlink";

// wallet (minuscules) → identité Discord vérifiée. Toute la page
// gouvernance est réservée aux membres actuels (voir useMeute.ts,
// estAutorise/chargerGouvernance) : cette table n'est peuplée qu'après
// cette vérification, jamais par un fetch direct depuis ce fichier.
const links = ref<Record<string, DiscordLink>>({});

/** Appelée par useMeute.ts une fois la preuve d'appartenance validée côté
 *  serveur — ce fichier ne fait plus lui-même aucune requête réseau pour
 *  peupler cette table, il ne fait qu'exposer le résultat déjà vérifié. */
function setLinks(data: Record<string, DiscordLink>) {
  links.value = data;
}

function discordLinkFor(address: Address | null | undefined): DiscordLink | null {
  if (!address) return null;
  return links.value[address.toLowerCase()] ?? null;
}

// Adresse en attente de confirmation avant de partir vers Discord — voir
// DiscordConsentModal.vue. Sans cet écran, rien n'informait le membre
// qu'une fois lié, son pseudo et son avatar deviennent visibles par les
// autres membres, à côté de ses votes/dons — un consentement RGPD valide
// doit être éclairé et spécifique, pas juste "un clic sur un bouton".
const pendingLinkAddress = ref<Address | null>(null);

/** Ouvre l'écran de consentement — ne part vers Discord qu'après confirmation. */
function requestDiscordLink(address: Address) {
  pendingLinkAddress.value = address;
}
function cancelDiscordLink() {
  pendingLinkAddress.value = null;
}

/** Démarre le flux OAuth Discord pour ce wallet — redirection pleine page,
 *  le retour se fait via ?discord=linked|error|not_member sur l'URL. */
function confirmDiscordLink() {
  const address = pendingLinkAddress.value;
  if (!address) return;
  pendingLinkAddress.value = null;
  // URL complète (pas juste l'origine) : sans ça, le retour de Discord
  // renvoyait systématiquement vers la racine du site au lieu de la page
  // de gouvernance d'où on est parti — constaté en test.
  const returnTo = encodeURIComponent(window.location.href);
  if (isLocal) {
    window.location.href = `${DEMO_SERVER_URL}/discord/start?wallet=${address}&returnTo=${returnTo}`;
    return;
  }
  window.location.href = `/.netlify/functions/discord-link?action=start&wallet=${address}&returnTo=${returnTo}`;
}

/** À appeler une fois au chargement d'une page pour lire et nettoyer le
 *  paramètre ?discord= laissé par le callback OAuth. */
function consumeDiscordCallbackParam(): "linked" | "error" | "not_member" | null {
  const url = new URL(window.location.href);
  const result = url.searchParams.get("discord") as "linked" | "error" | "not_member" | null;
  if (!result) return null;
  url.searchParams.delete("discord");
  window.history.replaceState({}, "", url.toString());
  return result;
}

/** Délie un compte Discord — signature du wallet exigée (prouve la
 *  possession sans dépenser de gas) plutôt qu'une simple requête HTTP, pour
 *  qu'on ne puisse jamais délier le compte de quelqu'un d'autre. Réponse au
 *  droit à l'oubli RGPD : sans ça, un lien une fois créé était permanent. */
async function unlinkDiscord(address: Address) {
  const { signMessage } = useWallet();
  const message = `Délier mon compte Discord de La Meute (${address})`;
  const signature = await signMessage(message);
  const res = await fetch(UNLINK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ wallet: address, signature }),
  });
  if (!res.ok) throw new Error(await res.text());
  const updated = { ...links.value };
  delete updated[address.toLowerCase()];
  links.value = updated;
}

export function useDiscordLink() {
  return {
    links,
    setLinks,
    discordLinkFor,
    pendingLinkAddress,
    requestDiscordLink,
    cancelDiscordLink,
    confirmDiscordLink,
    unlinkDiscord,
    consumeDiscordCallbackParam,
  };
}
