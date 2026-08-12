import { calculateNetworkState } from "./braess-model";

const TOTAL_DRIVERS = 4000;
// The scenario is fixed (4,000 drivers, symmetric routes), so the shortcut
// always pushes the equilibrium up (65 -> 80 minutes): "slower" is the
// objectively correct prediction to compare a visitor's guess against.
const CORRECT_PREDICTION = "slower";

interface Scenes {
  openingScene: HTMLElement;
  openingQuestion: HTMLElement;
  experiment: HTMLElement;
  experimentHeading: HTMLElement;
  reveal: HTMLElement;
  takeaway: HTMLElement;
  travelTimeOutput: HTMLElement;
  unilateralAlternative: HTMLElement;
  predictionComparison: HTMLElement;
  buildShortcutButton: HTMLElement;
  replayButton: HTMLElement;
  sceneNav: HTMLElement | null;
  shortcutPath: HTMLElement | null;
  shortcutLabel: HTMLElement | null;
}

function getScenes(root: Document): Scenes | null {
  const openingScene = root.getElementById("opening-scene");
  const openingQuestion = root.getElementById("opening-question");
  const experiment = root.getElementById("experiment");
  const experimentHeading = root.getElementById("experiment-heading");
  const reveal = root.getElementById("reveal");
  const takeaway = root.getElementById("takeaway");
  const travelTimeOutput = root.getElementById("travel-time-output");
  const unilateralAlternative = root.getElementById("unilateral-alternative");
  const predictionComparison = root.getElementById("prediction-comparison");
  const buildShortcutButton = root.getElementById("build-shortcut");
  const replayButton = root.getElementById("replay");
  const sceneNav = root.getElementById("scene-nav");
  const shortcutPath = root.getElementById("shortcut-path");
  const shortcutLabel = root.getElementById("shortcut-label");

  if (
    !openingScene ||
    !openingQuestion ||
    !experiment ||
    !experimentHeading ||
    !reveal ||
    !takeaway ||
    !travelTimeOutput ||
    !unilateralAlternative ||
    !predictionComparison ||
    !buildShortcutButton ||
    !replayButton
  ) {
    return null;
  }

  return {
    openingScene,
    openingQuestion,
    experiment,
    experimentHeading,
    reveal,
    takeaway,
    travelTimeOutput,
    unilateralAlternative,
    predictionComparison,
    buildShortcutButton,
    replayButton,
    sceneNav,
    shortcutPath,
    shortcutLabel,
  };
}

function setHidden(el: Element, hidden: boolean): void {
  if (hidden) el.setAttribute("hidden", "");
  else el.removeAttribute("hidden");
}

// Non-interactive elements (headings) only become focus targets once a
// tabindex is present. Adding it here, right before focusing, keeps the
// shipped static markup free of tabindex="-1" while still letting the
// transition move keyboard focus in a real browser.
function focusHeading(heading: HTMLElement): void {
  heading.setAttribute("tabindex", "-1");
  heading.focus();
}

function renderTravelTime(root: Document, output: HTMLElement, minutes: number): void {
  output.textContent = "";
  output.append("Current trip ");
  const strong = root.createElement("strong");
  strong.textContent = String(minutes);
  output.append(strong, " minutes");
}

function renderUnilateralAlternative(
  root: Document,
  output: HTMLElement,
  minutes: number,
): void {
  output.textContent = "";
  output.append("Going it alone instead would take ");
  const strong = root.createElement("strong");
  strong.textContent = String(minutes);
  output.append(strong, " minutes.");
}

export function initBraessExplainer(root: Document): void {
  const scenes = getScenes(root);
  if (!scenes) return;

  const {
    openingScene,
    openingQuestion,
    experiment,
    experimentHeading,
    reveal,
    takeaway,
    travelTimeOutput,
    unilateralAlternative,
    predictionComparison,
    buildShortcutButton,
    replayButton,
    sceneNav,
    shortcutPath,
    shortcutLabel,
  } = scenes;

  const predictionButtons = [...openingScene.querySelectorAll("button")];

  let savedPrediction: string | null = null;

  function showExperimentScene(): void {
    setHidden(openingScene, true);
    setHidden(experiment, false);
    setHidden(reveal, true);
    setHidden(takeaway, true);
    if (sceneNav) setHidden(sceneNav, false);
    focusHeading(experimentHeading);
  }

  function revealShortcutResult(): void {
    const before = calculateNetworkState({
      shortcutBuilt: false,
      totalDrivers: TOTAL_DRIVERS,
    });
    const after = calculateNetworkState({
      shortcutBuilt: true,
      totalDrivers: TOTAL_DRIVERS,
    });

    renderTravelTime(root, travelTimeOutput, after.equilibriumTravelTimeMinutes);
    renderUnilateralAlternative(
      root,
      unilateralAlternative,
      after.unilateralAlternativeTimeMinutes ?? 0,
    );
    setHidden(unilateralAlternative, false);

    if (savedPrediction) {
      const wasCorrect = savedPrediction.toLowerCase() === CORRECT_PREDICTION;
      predictionComparison.textContent =
        `You predicted the trip would be "${savedPrediction}". ` +
        (wasCorrect
          ? "You were right: "
          : "Actually, the opposite happened: ") +
        `building the shortcut pushed everyone's individually rational choice ` +
        `to a slower equilibrium, from ${before.equilibriumTravelTimeMinutes} up to ` +
        `${after.equilibriumTravelTimeMinutes} minutes — even though a lone driver ` +
        `going it alone would take ${after.unilateralAlternativeTimeMinutes} minutes, ` +
        `worse than sticking with the shortcut.`;
    }

    if (shortcutPath) {
      shortcutPath.classList.remove("route-shortcut-ghost");
      shortcutPath.classList.add("route-shortcut-built");
    }
    if (shortcutLabel) shortcutLabel.textContent = "Shortcut (built)";

    setHidden(reveal, false);
    setHidden(takeaway, false);
  }

  function resetToOpening(): void {
    savedPrediction = null;
    predictionComparison.textContent = "";

    const before = calculateNetworkState({
      shortcutBuilt: false,
      totalDrivers: TOTAL_DRIVERS,
    });
    renderTravelTime(root, travelTimeOutput, before.equilibriumTravelTimeMinutes);
    setHidden(unilateralAlternative, true);

    if (shortcutPath) {
      shortcutPath.classList.remove("route-shortcut-built");
      shortcutPath.classList.add("route-shortcut-ghost");
    }
    if (shortcutLabel) shortcutLabel.textContent = "Shortcut (not built)";

    setHidden(openingScene, false);
    setHidden(experiment, true);
    setHidden(reveal, true);
    setHidden(takeaway, true);
    if (sceneNav) setHidden(sceneNav, true);

    focusHeading(openingQuestion);
  }

  for (const button of predictionButtons) {
    button.addEventListener("click", () => {
      savedPrediction = button.textContent?.trim() ?? "";
      showExperimentScene();
    });
  }

  buildShortcutButton.addEventListener("click", () => {
    revealShortcutResult();
  });

  replayButton.addEventListener("click", () => {
    resetToOpening();
  });
}
