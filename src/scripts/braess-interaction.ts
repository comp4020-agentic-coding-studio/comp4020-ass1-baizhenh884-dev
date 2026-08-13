import { calculateNetworkState } from "./braess-model";

const TOTAL_DRIVERS = 4000;

// Each of the three predictions gets its own careful interpretation of the
// same observed result, rather than a single right/wrong split — "Yes, I
// think so" is directly challenged by what happened here, "I'm not sure" is
// resolved by it, and "Not necessarily" is borne out by it. None of the three
// is mocked, and none is stretched into a universal rule about roads.
function buildPredictionFeedback(
  prediction: string,
  beforeMinutes: number,
  afterMinutes: number,
  unilateralMinutes: number,
): string {
  const stance = prediction.trim().toLowerCase();

  if (stance === "yes, i think so") {
    return (
      `You predicted "${prediction}" — that more roads make traffic ` +
      `better. Here, the opposite happened: once everyone could use the ` +
      `new road, each driver's fastest individual choice pushed the ` +
      `group's trip from ${beforeMinutes} up to ${afterMinutes} minutes, ` +
      `even though a driver going it alone instead would still take ` +
      `${unilateralMinutes} minutes. Adding a road doesn't always improve ` +
      `traffic — this is one case where it didn't.`
    );
  }

  if (stance === "i'm not sure") {
    return (
      `You predicted "${prediction}" — a fair place to start, since it ` +
      `really does depend on the network. This one gives a clear answer: ` +
      `once everyone could use the new road, the group's trip got slower, ` +
      `from ${beforeMinutes} up to ${afterMinutes} minutes, and going it ` +
      `alone instead would still take ${unilateralMinutes} minutes. So ` +
      `here, at least, more road did not mean faster traffic.`
    );
  }

  return (
    `You predicted "${prediction}" — and that caution holds up here. Once ` +
    `everyone could use the new road, the group's trip got slower, from ` +
    `${beforeMinutes} up to ${afterMinutes} minutes, even though going it ` +
    `alone instead would still take ${unilateralMinutes} minutes. Adding a ` +
    `road doesn't always improve traffic, and this network is a case ` +
    `where it didn't.`
  );
}

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
      predictionComparison.textContent = buildPredictionFeedback(
        savedPrediction,
        before.equilibriumTravelTimeMinutes,
        after.equilibriumTravelTimeMinutes,
        after.unilateralAlternativeTimeMinutes ?? 0,
      );
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
