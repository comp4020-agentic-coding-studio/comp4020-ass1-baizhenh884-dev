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
      `shortcut, each driver's fastest individual choice pushed the ` +
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
      `once everyone could use the shortcut, the group's trip got slower, ` +
      `from ${beforeMinutes} up to ${afterMinutes} minutes, and going it ` +
      `alone instead would still take ${unilateralMinutes} minutes. So ` +
      `here, at least, more road did not mean faster traffic.`
    );
  }

  return (
    `You predicted "${prediction}" — and that caution holds up here. Once ` +
    `everyone could use the shortcut, the group's trip got slower, from ` +
    `${beforeMinutes} up to ${afterMinutes} minutes, even though going it ` +
    `alone instead would still take ${unilateralMinutes} minutes. Adding a ` +
    `road doesn't always improve traffic, and this network is a case ` +
    `where it didn't.`
  );
}

// Act 2's intro copy: it exists only once the visitor has predicted, so it
// always has a prediction to reference — there's no "no prediction" branch.
function buildExperimentIntro(prediction: string, baselineMinutes: number): string {
  return (
    `You predicted "${prediction}." Here's the setup — two routes, ` +
    `${baselineMinutes} min each, traffic splits evenly. You can toggle a ` +
    `new road on and off — a shortcut connecting the two routes partway ` +
    `along. Flip it and watch.`
  );
}

// One arithmetic readout line for the currently-rendered state, in the same
// resolved-minutes form as the diagram's edge labels (no raw driver counts or
// "x/100" formula — that division lives only here, spelled out once).
function buildEquationText(state: NetworkState): string {
  const { viaNode1Only, viaShortcut } = state.allocation;
  const minutes = state.equilibriumTravelTimeMinutes;
  if (viaShortcut > 0) {
    const leg = (viaNode1Only + viaShortcut) / 100;
    return `${leg} + 0 + ${leg} = ${minutes} min`;
  }
  return `${viaNode1Only / 100} + 45 = ${minutes} min`;
}

const driverFormat = new Intl.NumberFormat("en-AU");
const SVG_NS = "http://www.w3.org/2000/svg";

// Every edge label is a two-line chip: a bold headline (a resolved minute
// figure, or "Shortcut") and a smaller detail line underneath — never the
// "x/100 =" formula, which belongs only in the equation readout beside the
// diagram, not on top of the moving traffic. Rebuilding both tspans from
// scratch on every render keeps this the only place that shape is assembled.
function setEdgeLabel(root: Document, target: HTMLElement | null, main: string, sub: string): void {
  if (!target) return;
  target.textContent = "";
  const x = target.getAttribute("x") ?? "0";

  const mainTspan = root.createElementNS(SVG_NS, "tspan");
  mainTspan.setAttribute("class", "edge-chip-main");
  mainTspan.setAttribute("x", x);
  mainTspan.textContent = main;
  target.append(mainTspan);

  const subTspan = root.createElementNS(SVG_NS, "tspan");
  subTspan.setAttribute("class", "edge-chip-sub");
  subTspan.setAttribute("x", x);
  subTspan.setAttribute("dy", "13");
  subTspan.textContent = sub;
  target.append(subTspan);
}

interface Scenes {
  openingScene: HTMLElement;
  openingQuestion: HTMLElement;
  experiment: HTMLElement;
  experimentHeading: HTMLElement;
  experimentIntro: HTMLElement;
  reveal: HTMLElement;
  revealHeading: HTMLElement;
  takeaway: HTMLElement;
  travelTimeOutput: HTMLElement;
  travelTimeStrong: HTMLElement;
  unilateralAlternative: HTMLElement;
  predictionComparison: HTMLElement;
  buildShortcutButton: HTMLElement;
  shortcutStatus: HTMLElement;
  revealTriggerButton: HTMLElement;
  replayButton: HTMLElement;
  // Everything below is optional: the page has it, and the interaction tests'
  // fixtures include what they assert on, but nothing here is load-bearing
  // enough to refuse to wire up the explainer over.
  sceneNav: HTMLElement | null;
  networkDiagram: Element | null;
  shortcutLabel: HTMLElement | null;
  labelStartA: HTMLElement | null;
  labelAEnd: HTMLElement | null;
  labelStartB: HTMLElement | null;
  labelBEnd: HTMLElement | null;
  equationReadout: HTMLElement | null;
  driverCountNote: HTMLElement | null;
}

function getScenes(root: Document): Scenes | null {
  const openingScene = root.getElementById("opening-scene");
  const openingQuestion = root.getElementById("opening-question");
  const experiment = root.getElementById("experiment");
  const experimentHeading = root.getElementById("experiment-heading");
  const experimentIntro = root.getElementById("experiment-intro");
  const reveal = root.getElementById("reveal");
  const revealHeading = root.getElementById("reveal-heading");
  const takeaway = root.getElementById("takeaway");
  const travelTimeOutput = root.getElementById("travel-time-output");
  const travelTimeStrong = travelTimeOutput?.querySelector("strong") ?? null;
  const unilateralAlternative = root.getElementById("unilateral-alternative");
  const predictionComparison = root.getElementById("prediction-comparison");
  const buildShortcutButton = root.getElementById("build-shortcut");
  const shortcutStatus = root.getElementById("shortcut-status");
  const revealTriggerButton = root.getElementById("reveal-trigger");
  const replayButton = root.getElementById("replay");
  const sceneNav = root.getElementById("scene-nav");
  const networkDiagram = root.getElementById("network-diagram");
  const shortcutLabel = root.getElementById("shortcut-label");
  const labelStartA = root.getElementById("label-start-a");
  const labelAEnd = root.getElementById("label-a-end");
  const labelStartB = root.getElementById("label-start-b");
  const labelBEnd = root.getElementById("label-b-end");
  const equationReadout = root.getElementById("equation-readout");
  const driverCountNote = root.getElementById("driver-count-note");

  if (
    !openingScene ||
    !openingQuestion ||
    !experiment ||
    !experimentHeading ||
    !experimentIntro ||
    !reveal ||
    !revealHeading ||
    !takeaway ||
    !travelTimeOutput ||
    !travelTimeStrong ||
    !unilateralAlternative ||
    !predictionComparison ||
    !buildShortcutButton ||
    !shortcutStatus ||
    !revealTriggerButton ||
    !replayButton
  ) {
    return null;
  }

  return {
    openingScene,
    openingQuestion,
    experiment,
    experimentHeading,
    experimentIntro,
    reveal,
    revealHeading,
    takeaway,
    travelTimeOutput,
    travelTimeStrong,
    unilateralAlternative,
    predictionComparison,
    buildShortcutButton,
    shortcutStatus,
    revealTriggerButton,
    replayButton,
    sceneNav,
    networkDiagram,
    shortcutLabel,
    labelStartA,
    labelAEnd,
    labelStartB,
    labelBEnd,
    equationReadout,
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

function renderUnilateralAlternative(
  root: Document,
  output: HTMLElement,
  unilateralMinutes: number,
  equilibriumMinutes: number,
): void {
  output.textContent = "";
  output.append("Ducking back to your own route alone still takes ");
  const unilateralStrong = root.createElement("strong");
  unilateralStrong.textContent = String(unilateralMinutes);
  output.append(unilateralStrong, " minutes — worse than the ");
  const equilibriumStrong = root.createElement("strong");
  equilibriumStrong.textContent = String(equilibriumMinutes);
  output.append(
    equilibriumStrong,
    " everyone else is stuck with together. There's no escape once the " +
      "shortcut exists.",
  );
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
    experiment,
    experimentHeading,
    experimentIntro,
    reveal,
    revealHeading,
    takeaway,
    unilateralAlternative,
    predictionComparison,
    buildShortcutButton,
    shortcutStatus,
    revealTriggerButton,
    replayButton,
    sceneNav,
    networkDiagram,
    shortcutLabel,
    labelStartA,
    labelAEnd,
    labelStartB,
    labelBEnd,
    equationReadout,
    driverCountNote,
    travelTimeStrong,
  } = scenes;

  const predictionButtons = [...openingScene.querySelectorAll("button")];

  // Pure and deterministic for a fixed driver count, so both are computed
  // once and reused everywhere instead of re-deriving them on every toggle.
  const baselineState = calculateNetworkState({
    shortcutBuilt: false,
    totalDrivers: TOTAL_DRIVERS,
  });
  const shortcutState = calculateNetworkState({
    shortcutBuilt: true,
    totalDrivers: TOTAL_DRIVERS,
  });
  const ANIMATION_MS = 600;

  let savedPrediction: string | null = null;
  let shortcutBuilt = false;
  let predictionCheckShown = false;
  let pendingAnimation: ReturnType<typeof requestAnimationFrame> | null = null;
  let transitionTimeout: ReturnType<typeof setTimeout> | null = null;

  // One class on the diagram drives the whole picture — which legs carry
  // vehicles, how densely, and which legs go idle — so the visual state can't
  // drift out of step with the numbers below it. Every number rendered here
  // (edge labels, the equation, the route list) is read straight off `state`,
  // never recomputed or hard-coded, so the diagram and the readout can never
  // show two different networks.
  function renderNetwork(state: NetworkState): void {
    const { viaNode1Only, viaNode2Only, viaShortcut } = state.allocation;
    const built = viaShortcut > 0;

    networkDiagram?.classList.toggle("is-shortcut-built", built);
    setEdgeLabel(
      root,
      shortcutLabel,
      "Shortcut",
      built ? `0 min · ${driverFormat.format(viaShortcut)} cars` : "Not built",
    );

    const startAVolume = viaNode1Only + viaShortcut;
    const bEndVolume = viaNode2Only + viaShortcut;
    setEdgeLabel(
      root,
      labelStartA,
      `${startAVolume / 100} min`,
      `${driverFormat.format(startAVolume)} cars`,
    );
    setEdgeLabel(
      root,
      labelBEnd,
      `${bEndVolume / 100} min`,
      `${driverFormat.format(bEndVolume)} cars`,
    );
    setEdgeLabel(
      root,
      labelAEnd,
      "45 min",
      viaNode1Only > 0 ? `${driverFormat.format(viaNode1Only)} cars` : "unused",
    );
    setEdgeLabel(
      root,
      labelStartB,
      "45 min",
      viaNode2Only > 0 ? `${driverFormat.format(viaNode2Only)} cars` : "unused",
    );

    if (equationReadout) equationReadout.textContent = buildEquationText(state);

    if (driverCountNote) {
      driverCountNote.textContent = built
        ? `All ${driverFormat.format(viaShortcut)} drivers now take the ` +
          `combined path through the shortcut.`
        : `${driverFormat.format(viaNode1Only)} drivers take each of the ` +
          `two original routes.`;
    }
  }

  function cancelPendingEffects(): void {
    if (pendingAnimation !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(pendingAnimation);
    }
    pendingAnimation = null;
    if (transitionTimeout !== null) {
      clearTimeout(transitionTimeout);
      transitionTimeout = null;
    }
  }

  // Real browsers under prefers-reduced-motion, and this project's JSDOM
  // test fixtures (which implement neither matchMedia nor
  // requestAnimationFrame), both take the same "no" branch here — so there's
  // only one instant-update code path to keep correct, not a separate one
  // for tests.
  function shouldAnimate(): boolean {
    if (typeof window === "undefined" || typeof requestAnimationFrame !== "function") {
      return false;
    }
    if (typeof window.matchMedia !== "function") return false;
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function animateNumber(from: number, to: number, onDone: () => void): void {
    if (!shouldAnimate() || from === to) {
      travelTimeStrong.textContent = String(to);
      onDone();
      return;
    }

    const start = performance.now();
    const step = (now: number): void => {
      const progress = Math.min(1, (now - start) / ANIMATION_MS);
      travelTimeStrong.textContent = String(
        Math.round(from + (to - from) * progress),
      );
      if (progress < 1) {
        pendingAnimation = requestAnimationFrame(step);
      } else {
        pendingAnimation = null;
        onDone();
      }
    };
    pendingAnimation = requestAnimationFrame(step);
  }

  // Predicting is what unlocks Act 2: the experiment stays hidden until this
  // fires, so it's a hard prerequisite rather than a suggestion. The clicked
  // button stays enabled (so it keeps keyboard focus and no refocus is
  // needed); the other two disable to show the choice is made.
  function recordPrediction(button: HTMLButtonElement): void {
    if (savedPrediction) return;
    savedPrediction = button.textContent?.trim() ?? "";

    for (const other of predictionButtons) {
      if (other === button) other.classList.add("is-selected");
      else other.setAttribute("disabled", "");
    }

    experimentIntro.textContent = buildExperimentIntro(
      savedPrediction,
      baselineState.equilibriumTravelTimeMinutes,
    );

    setHidden(experiment, false);
    focusTarget(experimentHeading);
  }

  // The toggle's single job: flip the network between its two states and
  // lead the eye through cause and effect once, in order, when building —
  // diagram redistributes, the number ticks to match, and only then does the
  // "no escape" alternative line appear. Removing needs no such sequencing:
  // there's nothing left to build up to, so the number just ticks back down
  // and the alternative line disappears immediately.
  function setShortcutState(built: boolean): void {
    if (!savedPrediction || built === shortcutBuilt) return;

    cancelPendingEffects();
    const from = shortcutBuilt
      ? shortcutState.equilibriumTravelTimeMinutes
      : baselineState.equilibriumTravelTimeMinutes;
    const target = built ? shortcutState : baselineState;

    shortcutBuilt = built;

    buildShortcutButton.setAttribute("aria-pressed", String(built));
    buildShortcutButton.textContent = built
      ? "Remove the shortcut"
      : "Build the shortcut";
    setHidden(shortcutStatus, !built);
    // The toggle is a real, natively-focusable button that never disappears,
    // so (unlike the old one-shot control) focus can just stay put on it —
    // explicit rather than assumed, since not every browser moves focus to a
    // button on click. That's what makes flipping it back and forth
    // immediately keyboard-repeatable.
    buildShortcutButton.focus();

    renderNetwork(target);

    if (networkDiagram) {
      networkDiagram.classList.add("is-transitioning");
      transitionTimeout = setTimeout(() => {
        networkDiagram.classList.remove("is-transitioning");
        transitionTimeout = null;
      }, ANIMATION_MS);
    }

    if (built) {
      // Earned once, kept forever (until replay) — checking a prediction
      // doesn't require the shortcut to still be standing.
      setHidden(revealTriggerButton, false);
    } else {
      setHidden(unilateralAlternative, true);
    }

    animateNumber(from, target.equilibriumTravelTimeMinutes, () => {
      if (built) {
        renderUnilateralAlternative(
          root,
          unilateralAlternative,
          target.unilateralAlternativeTimeMinutes ?? 0,
          shortcutState.equilibriumTravelTimeMinutes,
        );
        setHidden(unilateralAlternative, false);
      }
    });
  }

  // Act 3: filling #reveal's content and un-hiding it happen as one step, in
  // one function, so the two can never drift apart — the "built without
  // predicting" bug was exactly that split happening across two places. The
  // assertion below is a second line of defence: predicting now gates ever
  // reaching this function, so savedPrediction is guaranteed here, but if
  // that guarantee is ever broken by a future change, this throws loudly
  // instead of shipping a heading with nothing underneath it.
  function showPredictionCheck(): void {
    if (!savedPrediction || predictionCheckShown) return;

    const unilateral = shortcutState.unilateralAlternativeTimeMinutes ?? 0;

    renderFeedback(
      root,
      predictionComparison,
      buildPredictionFeedback(
        savedPrediction,
        baselineState.equilibriumTravelTimeMinutes,
        shortcutState.equilibriumTravelTimeMinutes,
        unilateral,
      ),
      [
        baselineState.equilibriumTravelTimeMinutes,
        shortcutState.equilibriumTravelTimeMinutes,
        unilateral,
      ],
    );

    if (!predictionComparison.textContent?.trim()) {
      throw new Error(
        "showPredictionCheck: refusing to reveal #reveal with empty " +
          "content — filling it and un-hiding it must never come apart.",
      );
    }

    predictionCheckShown = true;
    setHidden(reveal, false);
    setHidden(takeaway, false);
    if (sceneNav) setHidden(sceneNav, false);

    // Same ordering as the build control above: move focus onto the result
    // before retiring the trigger that produced it.
    focusTarget(revealHeading);
    setHidden(revealTriggerButton, true);
  }

  function resetToOpening(): void {
    savedPrediction = null;
    shortcutBuilt = false;
    predictionCheckShown = false;
    cancelPendingEffects();
    predictionComparison.textContent = "";
    experimentIntro.textContent = "";

    travelTimeStrong.textContent = String(
      baselineState.equilibriumTravelTimeMinutes,
    );
    setHidden(unilateralAlternative, true);

    renderNetwork(baselineState);
    networkDiagram?.classList.remove("is-transitioning");

    buildShortcutButton.setAttribute("aria-pressed", "false");
    buildShortcutButton.textContent = "Build the shortcut";
    setHidden(shortcutStatus, true);
    setHidden(revealTriggerButton, true);

    setHidden(experiment, true);
    setHidden(reveal, true);
    setHidden(takeaway, true);
    if (sceneNav) setHidden(sceneNav, true);

    for (const button of predictionButtons) {
      button.removeAttribute("disabled");
      button.classList.remove("is-selected");
    }

    focusTarget(openingQuestion);
  }

  for (const button of predictionButtons) {
    button.addEventListener("click", () => {
      recordPrediction(button);
    });
  }

  buildShortcutButton.addEventListener("click", () => {
    setShortcutState(!shortcutBuilt);
  });

  revealTriggerButton.addEventListener("click", () => {
    showPredictionCheck();
  });

  replayButton.addEventListener("click", () => {
    resetToOpening();
  });
}
