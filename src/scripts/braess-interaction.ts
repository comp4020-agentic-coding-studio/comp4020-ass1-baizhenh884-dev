import { calculateNetworkState, type NetworkState } from "./braess-model";

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

const BUILD_LABEL = "Build the shortcut";
const BUILT_LABEL = "Shortcut built";

const driverFormat = new Intl.NumberFormat("en-AU");

interface Scenes {
  openingScene: HTMLElement;
  openingQuestion: HTMLElement;
  predictionStatus: HTMLElement;
  reveal: HTMLElement;
  takeaway: HTMLElement;
  travelTimeOutput: HTMLElement;
  unilateralAlternative: HTMLElement;
  predictionComparison: HTMLElement;
  buildShortcutButton: HTMLElement;
  replayButton: HTMLElement;
  // Everything below is optional: the page has it, and the interaction tests'
  // fixtures include what they assert on, but nothing here is load-bearing
  // enough to refuse to wire up the explainer over.
  sceneNav: HTMLElement | null;
  networkDiagram: Element | null;
  shortcutLabel: HTMLElement | null;
  routeADrivers: HTMLElement | null;
  routeBDrivers: HTMLElement | null;
  routeShortcutRow: HTMLElement | null;
  routeShortcutDrivers: HTMLElement | null;
  driverCountNote: HTMLElement | null;
}

function getScenes(root: Document): Scenes | null {
  const openingScene = root.getElementById("opening-scene");
  const openingQuestion = root.getElementById("opening-question");
  const predictionStatus = root.getElementById("prediction-status");
  const reveal = root.getElementById("reveal");
  const takeaway = root.getElementById("takeaway");
  const travelTimeOutput = root.getElementById("travel-time-output");
  const unilateralAlternative = root.getElementById("unilateral-alternative");
  const predictionComparison = root.getElementById("prediction-comparison");
  const buildShortcutButton = root.getElementById("build-shortcut");
  const replayButton = root.getElementById("replay");
  const sceneNav = root.getElementById("scene-nav");
  const networkDiagram = root.getElementById("network-diagram");
  const shortcutLabel = root.getElementById("shortcut-label");
  const routeADrivers = root.getElementById("route-a-drivers");
  const routeBDrivers = root.getElementById("route-b-drivers");
  const routeShortcutRow = root.getElementById("route-shortcut-row");
  const routeShortcutDrivers = root.getElementById("route-shortcut-drivers");
  const driverCountNote = root.getElementById("driver-count-note");

  if (
    !openingScene ||
    !openingQuestion ||
    !predictionStatus ||
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
    predictionStatus,
    reveal,
    takeaway,
    travelTimeOutput,
    unilateralAlternative,
    predictionComparison,
    buildShortcutButton,
    replayButton,
    sceneNav,
    networkDiagram,
    shortcutLabel,
    routeADrivers,
    routeBDrivers,
    routeShortcutRow,
    routeShortcutDrivers,
    driverCountNote,
  };
}

function setHidden(el: Element, hidden: boolean): void {
  if (hidden) el.setAttribute("hidden", "");
  else el.removeAttribute("hidden");
}

// Non-interactive elements (a heading, a result) only become focus targets
// once a tabindex is present. Adding it here, right before focusing, keeps the
// shipped static markup free of tabindex="-1" while still letting the
// transition move keyboard focus in a real browser.
function focusTarget(target: HTMLElement): void {
  target.setAttribute("tabindex", "-1");
  target.focus();
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

function renderDrivers(target: HTMLElement | null, drivers: number): void {
  if (target) target.textContent = `${driverFormat.format(drivers)} drivers`;
}

// The 65/80/85-minute figures are the entire point of this scene, so they
// get pulled out as <strong> rather than sitting flat in a paragraph — the
// same treatment the experiment scene already gives its own numbers. This
// only changes how the text is marked up, not what it says: the numbers are
// matched back out of the same string buildPredictionFeedback already
// produces, so textContent (and every test asserting on it) is unchanged.
function renderFeedback(
  root: Document,
  container: HTMLElement,
  text: string,
  numbers: number[],
): void {
  container.textContent = "";
  const unique = [...new Set(numbers)];
  if (unique.length === 0) {
    container.append(text);
    return;
  }

  const pattern = new RegExp(`\\b(${unique.join("|")})\\b`, "g");
  let lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) container.append(text.slice(lastIndex, index));
    const strong = root.createElement("strong");
    strong.textContent = match[0];
    container.append(strong);
    lastIndex = index + match[0].length;
  }
  container.append(text.slice(lastIndex));
}

export function initBraessExplainer(root: Document): void {
  const scenes = getScenes(root);
  if (!scenes) return;

  const {
    openingScene,
    openingQuestion,
    predictionStatus,
    reveal,
    takeaway,
    travelTimeOutput,
    unilateralAlternative,
    predictionComparison,
    buildShortcutButton,
    replayButton,
    sceneNav,
    networkDiagram,
    shortcutLabel,
    routeADrivers,
    routeBDrivers,
    routeShortcutRow,
    routeShortcutDrivers,
    driverCountNote,
  } = scenes;

  const predictionButtons = [...openingScene.querySelectorAll("button")];

  let savedPrediction: string | null = null;
  let shortcutBuilt = false;

  // One class on the diagram drives the whole picture — which legs carry
  // vehicles, how densely, and which legs go idle — so the visual state can't
  // drift out of step with the numbers below it.
  function renderNetwork(state: NetworkState): void {
    const { viaNode1Only, viaNode2Only, viaShortcut } = state.allocation;
    const built = viaShortcut > 0;

    networkDiagram?.classList.toggle("is-shortcut-built", built);
    if (shortcutLabel) {
      shortcutLabel.textContent = built
        ? "Shortcut (built)"
        : "Shortcut (not built)";
    }

    renderDrivers(routeADrivers, viaNode1Only);
    renderDrivers(routeBDrivers, viaNode2Only);
    renderDrivers(routeShortcutDrivers, viaShortcut);
    if (routeShortcutRow) setHidden(routeShortcutRow, !built);

    if (driverCountNote) {
      const total = viaNode1Only + viaNode2Only + viaShortcut;
      driverCountNote.textContent = built
        ? `All ${driverFormat.format(total)} drivers now take the combined ` +
          `path through the shortcut, leaving the far half of each original ` +
          `route empty.`
        : `${driverFormat.format(total)} drivers in total, split evenly ` +
          `across the two routes while the shortcut doesn't exist.`;
    }
  }

  function setBuildButtonBuilt(built: boolean): void {
    buildShortcutButton.textContent = built ? BUILT_LABEL : BUILD_LABEL;
    if (built) buildShortcutButton.setAttribute("disabled", "");
    else buildShortcutButton.removeAttribute("disabled");
  }

  // Predicting saves the response in place — it doesn't hide the question or
  // reveal anything new, since the experiment below it is already visible.
  // The clicked button stays enabled (so it keeps keyboard focus and no
  // refocus is needed); the other two disable to show the choice is made.
  function recordPrediction(button: HTMLButtonElement): void {
    savedPrediction = button.textContent?.trim() ?? "";

    for (const other of predictionButtons) {
      if (other === button) other.classList.add("is-selected");
      else other.setAttribute("disabled", "");
    }

    predictionStatus.textContent =
      `You predicted "${savedPrediction}." Build the shortcut below to see ` +
      `what actually happens.`;
    setHidden(predictionStatus, false);
  }

  function revealShortcutResult(): void {
    // The road only gets built once. A disabled button shouldn't emit clicks
    // anyway, but the guard keeps a stray programmatic call from replaying
    // the transition on top of an already-built network.
    if (shortcutBuilt) return;
    shortcutBuilt = true;

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
      const unilateral = after.unilateralAlternativeTimeMinutes ?? 0;
      renderFeedback(
        root,
        predictionComparison,
        buildPredictionFeedback(
          savedPrediction,
          before.equilibriumTravelTimeMinutes,
          after.equilibriumTravelTimeMinutes,
          unilateral,
        ),
        [
          before.equilibriumTravelTimeMinutes,
          after.equilibriumTravelTimeMinutes,
          unilateral,
        ],
      );
    }

    renderNetwork(after);

    setHidden(reveal, false);
    setHidden(takeaway, false);
    if (sceneNav) setHidden(sceneNav, false);

    // Move focus off the build control before retiring it, or disabling the
    // focused element drops keyboard focus to the body. It goes to the travel
    // time — the result of the press, and crucially still inside this scene,
    // so nobody gets scrolled away from the network they just changed.
    focusTarget(travelTimeOutput);
    setBuildButtonBuilt(true);
  }

  function resetToOpening(): void {
    savedPrediction = null;
    shortcutBuilt = false;
    predictionComparison.textContent = "";

    const before = calculateNetworkState({
      shortcutBuilt: false,
      totalDrivers: TOTAL_DRIVERS,
    });
    renderTravelTime(root, travelTimeOutput, before.equilibriumTravelTimeMinutes);
    setHidden(unilateralAlternative, true);

    renderNetwork(before);
    setBuildButtonBuilt(false);

    setHidden(reveal, true);
    setHidden(takeaway, true);
    if (sceneNav) setHidden(sceneNav, true);

    for (const button of predictionButtons) {
      button.removeAttribute("disabled");
      button.classList.remove("is-selected");
    }
    predictionStatus.textContent = "";
    setHidden(predictionStatus, true);

    focusTarget(openingQuestion);
  }

  for (const button of predictionButtons) {
    button.addEventListener("click", () => {
      recordPrediction(button);
    });
  }

  buildShortcutButton.addEventListener("click", () => {
    revealShortcutResult();
  });

  replayButton.addEventListener("click", () => {
    resetToOpening();
  });
}
