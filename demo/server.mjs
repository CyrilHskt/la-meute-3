// Petit serveur local pour piloter les scénarios de démo depuis la page
// demo/public/index.html. N'écoute que sur localhost, jamais déployé —
// voir docs/local/soutenance-prep.md pour le contexte.
//
// Prérequis avant de lancer ce serveur : `npx hardhat node` tourne déjà
// dans un autre terminal.
//
// Usage : node demo/server.mjs

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { scenarios, findScenario } from "./scenarios/index.js";
import { createContext, reset, buildIndex, RESET_COMMAND } from "./actions.js";
import { rulesFor } from "./rules.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.DEMO_PORT ?? 4100;
const PUBLIC_DIR = join(__dirname, "public");

const MIME = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript" };

let ctx = createContext();
let activeScenario = scenarios[0];
let currentIndex = 0;
let lastMessage = null;
let lastError = null;

// Progression d'une étape en cours (mise à jour par l'action elle-même via
// ctx.progress.tick()/setTotal(), lue en parallèle par le front qui poll
// /api/progress pendant que la requête POST /api/step est encore en vol).
// Une seule étape à la fois tourne (le front attend la réponse avant d'en
// relancer une autre), donc un objet module-scope suffit.
function freshProgress() {
  return {
    current: 0,
    total: 1,
    tick(n = 1) {
      this.current += n;
    },
    setTotal(n) {
      this.total = n;
    },
  };
}

function publicSteps() {
  return activeScenario.steps.map((step, i) => ({
    id: step.id,
    label: step.label,
    narration: step.narration,
    command: step.command,
    done: i < currentIndex,
    current: i === currentIndex,
  }));
}

function stateBody(extra = {}) {
  return {
    scenarios: scenarios.map((s) => ({ id: s.id, label: s.label, group: s.group })),
    activeScenarioId: activeScenario.id,
    rules: rulesFor(activeScenario.ruleIds),
    steps: publicSteps(),
    lastMessage,
    lastError,
    finished: currentIndex >= activeScenario.steps.length,
    contractAddress: ctx.contractAddress ?? null,
    resetCommand: RESET_COMMAND,
    ...extra,
  };
}

function sendJson(res, status, body) {
  // Le front (servi par Vite/Netlify sur un autre port) doit pouvoir
  // appeler ce serveur en local — CORS ouvert, sans risque : rien ici ne
  // tourne jamais ailleurs qu'en local, sur la machine du développeur.
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/state") {
    return sendJson(res, 200, stateBody());
  }

  if (req.method === "GET" && url.pathname === "/api/progress") {
    return sendJson(res, 200, { current: ctx.progress?.current ?? 0, total: ctx.progress?.total ?? 1 });
  }

  if (req.method === "GET" && url.pathname === "/api/index") {
    try {
      return sendJson(res, 200, await buildIndex(ctx));
    } catch (e) {
      return sendJson(res, 503, { error: e.message ?? String(e) });
    }
  }

  // Changer de scénario redéploie systématiquement un contrat neuf : les
  // scénarios de test partent d'un contrat vide, pas de l'état laissé par
  // le scénario précédent.
  if (req.method === "POST" && url.pathname === "/api/select") {
    const { id } = await readBody(req);
    activeScenario = findScenario(id);
    currentIndex = 0;
    try {
      lastMessage = await reset(ctx);
      lastError = null;
    } catch (e) {
      lastError = e.message ?? String(e);
    }
    return sendJson(res, 200, stateBody());
  }

  if (req.method === "POST" && url.pathname === "/api/reset") {
    try {
      lastMessage = await reset(ctx);
      lastError = null;
      currentIndex = 0;
    } catch (e) {
      lastError = e.message ?? String(e);
    }
    return sendJson(res, 200, stateBody());
  }

  if (req.method === "POST" && url.pathname === "/api/step") {
    if (currentIndex >= activeScenario.steps.length) return sendJson(res, 400, { error: "Scénario déjà terminé." });
    if (!ctx.provider) {
      lastError = "Contrat non connecté — clique d'abord sur Réinitialiser.";
      return sendJson(res, 200, stateBody());
    }
    ctx.progress = freshProgress();
    try {
      lastMessage = await activeScenario.steps[currentIndex].run(ctx);
      lastError = null;
      currentIndex += 1;
    } catch (e) {
      lastError = e.message ?? String(e);
    }
    ctx.progress.current = ctx.progress.total; // barre pleine même si l'action n'a pas tick jusqu'au bout (erreur, étape courte)
    return sendJson(res, 200, stateBody());
  }

  sendJson(res, 404, { error: "Route inconnue." });
}

async function serveStatic(req, res, url) {
  const path = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = join(PUBLIC_DIR, path);
  if (!filePath.startsWith(PUBLIC_DIR)) return res.writeHead(403).end();
  try {
    const content = await readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME[extname(filePath)] ?? "application/octet-stream" });
    res.end(content);
  } catch {
    res.writeHead(404).end("Introuvable.");
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith("/api/")) return void handleApi(req, res, url);
  return void serveStatic(req, res, url);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Panneau de démo : http://127.0.0.1:${PORT}`);
  console.log("Assure-toi que `npx hardhat node` tourne déjà, puis choisis un scénario.");
});
