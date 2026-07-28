const stepsEl = document.getElementById("steps");
const messageEl = document.getElementById("message");
const resetBtn = document.getElementById("reset");
const resetInfoBtn = document.getElementById("reset-info");
const resetCommandEl = document.getElementById("reset-command");
const titleEl = document.getElementById("scenario-title");
const menuCertificationEl = document.getElementById("menu-certification");
const menuSoutenanceEl = document.getElementById("menu-soutenance");
const menuTestEl = document.getElementById("menu-test");
const rulesListEl = document.getElementById("rules-list");

// Which cards have their "command" block expanded — survives re-renders
// (each runStep()/refresh() rebuilds the steps' DOM).
const openCommands = new Set();

// Id of the step currently running (for the duration of a POST
// /api/step), to show its progress bar and disable its button while the
// job actually runs server-side (setup ≈ 15-20s).
let runningStepId = null;

/** `lines`: [{ type: "title"|"comment"|"code", text }] -> one <div> per
 *  line, with a class per type so the CSS can distinguish the three. */
function renderCommandLines(container, lines) {
  container.innerHTML = "";
  (lines ?? []).forEach((line) => {
    const div = document.createElement("div");
    div.className = `cmd-${line.type}`;
    div.textContent = line.type === "comment" ? `// ${line.text}` : line.text;
    container.appendChild(div);
  });
}

function renderMenu(state) {
  const build = (container, group) => {
    container.innerHTML = "";
    state.scenarios
      .filter((s) => s.group === group)
      .forEach((s) => {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.className = "menu-item" + (s.id === state.activeScenarioId ? " active" : "");
        btn.textContent = s.label;
        btn.disabled = runningStepId !== null;
        btn.addEventListener("click", () => selectScenario(s.id));
        li.appendChild(btn);
        container.appendChild(li);
      });
  };
  build(menuCertificationEl, "certification");
  build(menuSoutenanceEl, "soutenance");
  build(menuTestEl, "test");

  const active = state.scenarios.find((s) => s.id === state.activeScenarioId);
  titleEl.textContent = active ? active.label : "—";
}

function renderRules(rules) {
  rulesListEl.innerHTML = "";
  (rules ?? []).forEach((rule) => {
    const div = document.createElement("div");
    div.className = "rule";
    const title = document.createElement("div");
    title.className = "rule-title";
    title.textContent = rule.title;
    const body = document.createElement("div");
    body.className = "rule-body";
    body.textContent = rule.body;
    div.append(title, body);
    rulesListEl.appendChild(div);
  });
}

function render(state) {
  renderMenu(state);
  renderRules(state.rules);

  messageEl.textContent = state.lastError ?? state.lastMessage ?? "";
  messageEl.className = "message" + (state.lastError ? " error" : state.lastMessage ? " success" : "");

  if (state.resetCommand) renderCommandLines(resetCommandEl, state.resetCommand);

  stepsEl.innerHTML = "";

  if (state.finished) {
    const li = document.createElement("li");
    li.className = "done-banner";
    li.textContent = "Scénario terminé — clique sur Réinitialiser pour le rejouer.";
    stepsEl.appendChild(li);
    return;
  }

  state.steps.forEach((step) => {
    const li = document.createElement("li");
    li.className = "step" + (step.current ? " current" : "") + (step.done ? " done" : "");

    const body = document.createElement("div");
    body.className = "step-body";
    const label = document.createElement("div");
    label.className = "label";
    label.textContent = step.label;
    const narration = document.createElement("div");
    narration.className = "narration";
    narration.textContent = step.narration;
    body.append(label, narration);

    const infoBtn = document.createElement("button");
    infoBtn.className = "info-toggle" + (openCommands.has(step.id) ? " active" : "");
    infoBtn.type = "button";
    infoBtn.title = "Voir ce qui se passe derrière";
    infoBtn.textContent = "ⓘ";
    infoBtn.addEventListener("click", () => {
      openCommands.has(step.id) ? openCommands.delete(step.id) : openCommands.add(step.id);
      render(state);
    });

    const running = runningStepId === step.id;
    const btn = document.createElement("button");
    btn.textContent = running ? "En cours..." : step.current ? "Lancer" : step.done ? "Fait" : "En attente";
    btn.disabled = !step.current || running;
    btn.addEventListener("click", () => runStep(step.id));

    li.append(body, infoBtn, btn);

    if (step.current) {
      const bar = document.createElement("div");
      bar.className = "step-progress" + (running ? " step-progress--active" : "");
      bar.dataset.stepId = step.id;
      const fill = document.createElement("div");
      fill.className = "step-progress-fill";
      fill.style.width = "0%";
      bar.appendChild(fill);
      li.appendChild(bar);
    }

    if (openCommands.has(step.id) && step.command) {
      const div = document.createElement("div");
      div.className = "command";
      renderCommandLines(div, step.command);
      li.appendChild(div);
    }

    stepsEl.appendChild(li);
  });
}

async function refresh() {
  const res = await fetch("/api/state");
  render(await res.json());
}

/** Polls /api/progress while an /api/step request is in flight, and only
 *  updates the bar's width — no full re-render, to keep the animation
 *  smooth. */
function pollProgress(stepId) {
  return setInterval(async () => {
    try {
      const res = await fetch("/api/progress");
      const { current, total } = await res.json();
      const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 100;
      const fill = stepsEl.querySelector(`.step-progress[data-step-id="${stepId}"] .step-progress-fill`);
      if (fill) fill.style.width = `${pct}%`;
    } catch {
      // No big deal if a poll fails — the next one will retry.
    }
  }, 300);
}

async function runStep(stepId) {
  runningStepId = stepId;
  await refresh(); // réaffiche immédiatement avec la barre à 0% et le bouton désactivé
  const interval = pollProgress(stepId);
  try {
    const res = await fetch("/api/step", { method: "POST" });
    const nextState = await res.json();
    // Reset to null BEFORE rendering: otherwise this render still sees the
    // step that just finished as "running" (its button stays stuck on
    // "En cours..." until the next full render, which might never happen
    // — observed in testing).
    runningStepId = null;
    render(nextState);
  } finally {
    clearInterval(interval);
    runningStepId = null;
  }
}

async function selectScenario(id) {
  openCommands.clear();
  messageEl.textContent = "Changement de scénario (redéploiement du contrat)...";
  messageEl.className = "message";
  const res = await fetch("/api/select", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  render(await res.json());
}

resetInfoBtn.addEventListener("click", () => {
  resetInfoBtn.classList.toggle("active");
  resetCommandEl.classList.toggle("hidden");
});

resetBtn.addEventListener("click", async () => {
  messageEl.textContent = "Réinitialisation en cours (redéploiement du contrat)...";
  messageEl.className = "message";
  const res = await fetch("/api/reset", { method: "POST" });
  render(await res.json());
});

refresh();
