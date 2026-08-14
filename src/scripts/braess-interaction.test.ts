import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

// Tier C: the interaction contract from CLAUDE.md's Core interaction section,
// wired up by src/scripts/braess-interaction.ts's initBraessExplainer(root).
// Three acts, progressively revealed on one continuous page: predicting
// (Act 1) is a hard prerequisite for reaching the experiment (Act 2), and
// the shortcut is a genuine two-way toggle rather than a one-shot build —
// flipping it back and forth surfaces a trigger the first time it's built,
// which then stays available (Act 3 is asked for, not dumped automatically,
// and once earned it isn't taken away just because the shortcut comes back
// down).
//
// JSDOM doesn't execute <script src="..."> parsed from static HTML, so
// spec/assignment-1.test.ts (Tier B) can only check the markup an
// interaction script starts from. To test actual behaviour, this file
// builds its own DOM fixture that mirrors that markup, then imports and
// calls the module's initializer directly against it — the same workaround
// braess-model.test.ts already uses for the pure model.
const MODULE_PATH = resolve("src/scripts/braess-interaction.ts");
const NOT_FOUND =
  "src/scripts/braess-interaction.ts not found — implement " +
  "initBraessExplainer(root) to wire up the explainer, per CLAUDE.md's " +
  "Core interaction contract.";

async function loadInteractionModule() {
  expect(existsSync(MODULE_PATH), NOT_FOUND).toBe(true);
  return import(/* @vite-ignore */ pathToFileURL(MODULE_PATH).href);
}

const PREDICTIONS = [
  "Yes, I think so",
  "I'm not sure",
  "Not necessarily",
] as const;

// A fresh fixture per test, not a shared one: each test drives the DOM
// through clicks that mutate it, and the three-prediction tests need to
// start from the same clean initial state independently of one another.
function buildFixture(): Document {
  const dom = new JSDOM(
    `<!doctype html>
    <body>
      <div id="opening-scene">
        <h1 id="opening-question" tabindex="-1">
          Will a shortcut make traffic faster?
        </h1>
        <div role="group" aria-labelledby="opening-question">
          <button type="button">Yes, I think so</button>
          <button type="button">I'm not sure</button>
          <button type="button">Not necessarily</button>
        </div>
      </div>

      <section id="experiment" hidden>
        <h2 id="experiment-heading" tabindex="-1">The network, right now</h2>
        <p id="experiment-intro" role="status"></p>

        <svg id="network-diagram" class="network-diagram">
          <path class="route route-a" />
          <text id="label-start-a" x="70"
            ><tspan class="edge-chip-main" x="70">20 min</tspan><tspan
              class="edge-chip-sub"
              x="70">2,000 cars</tspan></text>
          <path class="route route-a leg-idle" />
          <text id="label-a-end" x="270" class="leg-idle"
            ><tspan class="edge-chip-main" x="270">45 min</tspan><tspan
              class="edge-chip-sub"
              x="270">2,000 cars</tspan></text>
          <path class="route route-b leg-idle" />
          <text id="label-start-b" x="70" class="leg-idle"
            ><tspan class="edge-chip-main" x="70">45 min</tspan><tspan
              class="edge-chip-sub"
              x="70">2,000 cars</tspan></text>
          <path class="route route-b" />
          <text id="label-b-end" x="270"
            ><tspan class="edge-chip-main" x="270">20 min</tspan><tspan
              class="edge-chip-sub"
              x="270">2,000 cars</tspan></text>
          <path id="shortcut-path" class="route route-shortcut" />
          <text id="shortcut-label" x="260"
            ><tspan class="edge-chip-main" x="260">Shortcut</tspan><tspan
              class="edge-chip-sub"
              x="260">Not built</tspan></text>
          <path class="flow flow-through" />
          <path class="flow flow-split" />
          <path class="flow flow-split" />
          <path class="flow flow-through" />
          <path class="flow flow-shortcut" />
        </svg>

        <p id="driver-count-note">2,000 drivers take each of the two original routes.</p>

        <p role="status" id="travel-time-output">
          Current trip <strong>65</strong> minutes
        </p>
        <p id="equation-readout">20 + 45 = 65 min</p>
        <p id="unilateral-alternative" hidden>
          Going it alone instead would take <strong>85</strong> minutes.
        </p>
        <button type="button" id="build-shortcut" aria-pressed="false">
          Build the shortcut
        </button>
        <p id="shortcut-status" hidden>
          <span aria-hidden="true">✓</span> Shortcut built
        </p>
        <button type="button" id="reveal-trigger" hidden>
          Did your prediction hold up?
        </button>
      </section>

      <section id="reveal" hidden>
        <h2 id="reveal-heading" tabindex="-1">Did your prediction hold up?</h2>
        <p id="prediction-comparison"></p>
      </section>

      <section id="takeaway" hidden>
        <p>Individually rational choices can make the group worse off.</p>
      </section>

      <button type="button" id="replay">Start again</button>
    </body>`,
    { url: "https://example.test/" },
  );
  return dom.window.document;
}

function findButtonByText(root: ParentNode, text: string): HTMLButtonElement {
  const button = [...root.querySelectorAll("button")].find(
    (el) => el.textContent?.trim() === text,
  );
  if (!button) throw new Error(`No <button> with text "${text}" in fixture`);
  return button as HTMLButtonElement;
}

function isHidden(el: Element | null): boolean {
  return el?.hasAttribute("hidden") ?? true;
}

describe("braess-interaction: initBraessExplainer", () => {
  it("Act 1: starts with only the opening question visible", async () => {
    const { initBraessExplainer } = await loadInteractionModule();
    const document = buildFixture();

    initBraessExplainer(document);

    expect(isHidden(document.getElementById("opening-scene"))).toBe(false);
    expect(
      isHidden(document.getElementById("experiment")),
      "the experiment must stay hidden until the visitor predicts — Act 2 isn't reachable from Act 1",
    ).toBe(true);
    expect(isHidden(document.getElementById("reveal"))).toBe(true);
    expect(isHidden(document.getElementById("takeaway"))).toBe(true);
  });

  it("cannot build the shortcut before predicting", async () => {
    const { initBraessExplainer } = await loadInteractionModule();
    const document = buildFixture();
    initBraessExplainer(document);

    // The build control is only reachable through the hidden #experiment
    // section, but a direct click bypasses visibility entirely — the guard
    // in the click handler is what actually enforces the prerequisite.
    findButtonByText(document, "Build the shortcut").click();

    expect(
      document.getElementById("travel-time-output")?.textContent,
      "the network must stay at its 65-minute baseline",
    ).toMatch(/\b65\b/);
    expect(
      isHidden(document.getElementById("experiment")),
      "the experiment must still be hidden — building without predicting is a no-op, not a shortcut into Act 2",
    ).toBe(true);
    expect(isHidden(document.getElementById("reveal-trigger"))).toBe(true);
  });

  for (const prediction of PREDICTIONS) {
    it(`recording "${prediction}" reveals the experiment with intro copy referencing it`, async () => {
      const { initBraessExplainer } = await loadInteractionModule();
      const document = buildFixture();
      initBraessExplainer(document);

      const button = findButtonByText(document, prediction);
      button.click();

      expect(
        isHidden(document.getElementById("opening-scene")),
        "the opening question must stay visible after predicting",
      ).toBe(false);
      expect(
        isHidden(document.getElementById("experiment")),
        "predicting must reveal the experiment",
      ).toBe(false);
      expect(
        isHidden(document.getElementById("reveal")),
        "reveal must stay hidden until the shortcut is built and the trigger is clicked",
      ).toBe(true);
      expect(
        button.hasAttribute("disabled"),
        "the chosen prediction stays enabled and visibly selected",
      ).toBe(false);
      expect(button.classList.contains("is-selected")).toBe(true);

      for (const other of PREDICTIONS.filter((p) => p !== prediction)) {
        expect(
          findButtonByText(document, other).hasAttribute("disabled"),
          `"${other}" must disable once a different prediction is recorded`,
        ).toBe(true);
      }

      const intro = document.getElementById("experiment-intro");
      expect(
        intro?.textContent?.toLowerCase(),
        "the experiment's intro copy must reference the saved prediction",
      ).toContain(prediction.toLowerCase());
      expect(
        intro?.textContent,
        "the intro copy must reference the 65-minute baseline it's about to change",
      ).toMatch(/\b65\b/);
    });
  }

  it("a second prediction click is a no-op once one is already saved", async () => {
    const { initBraessExplainer } = await loadInteractionModule();
    const document = buildFixture();
    initBraessExplainer(document);

    findButtonByText(document, "Yes, I think so").click();
    const introAfterFirst = document.getElementById(
      "experiment-intro",
    )?.textContent;

    findButtonByText(document, "I'm not sure").click();

    expect(
      document.getElementById("experiment-intro")?.textContent,
      "the saved prediction must not be overwritten by a later click",
    ).toBe(introAfterFirst);
    expect(
      findButtonByText(document, "I'm not sure").classList.contains(
        "is-selected",
      ),
    ).toBe(false);
  });

  for (const prediction of PREDICTIONS) {
    it(`preserves the "${prediction}" prediction through to the reveal trigger`, async () => {
      const { initBraessExplainer } = await loadInteractionModule();
      const document = buildFixture();
      initBraessExplainer(document);

      findButtonByText(document, prediction).click();
      findButtonByText(document, "Build the shortcut").click();

      const output = document.getElementById("travel-time-output");
      expect(output?.textContent, "Build the shortcut: 4000/100+0+4000/100 = 80").toMatch(
        /\b80\b/,
      );
      expect(output?.textContent).not.toMatch(/\b65\b/);
      expect(
        isHidden(document.getElementById("unilateral-alternative")),
        "the 85-minute unilateral alternative must become visible",
      ).toBe(false);
      expect(
        document.getElementById("unilateral-alternative")?.textContent,
      ).toMatch(/\b85\b/);

      expect(
        isHidden(document.getElementById("reveal-trigger")),
        "building the shortcut must surface the reveal trigger",
      ).toBe(false);
      expect(
        isHidden(document.getElementById("reveal")),
        "the reveal itself must not appear until the trigger is clicked",
      ).toBe(true);
      expect(isHidden(document.getElementById("takeaway"))).toBe(true);

      findButtonByText(document, "Did your prediction hold up?").click();

      expect(isHidden(document.getElementById("reveal"))).toBe(false);
      expect(isHidden(document.getElementById("takeaway"))).toBe(false);
      expect(
        isHidden(document.getElementById("reveal-trigger")),
        "the trigger retires once it's been used",
      ).toBe(true);

      const comparison = document.getElementById("prediction-comparison");
      expect(
        comparison?.textContent?.toLowerCase(),
        `the comparison must reference the saved "${prediction}" prediction, not just the outcome`,
      ).toContain(prediction.toLowerCase());
    });
  }

  it("reset/replay clears the saved prediction and result, hides the experiment again, and returns focus to the opening question", async () => {
    const { initBraessExplainer } = await loadInteractionModule();
    const document = buildFixture();
    initBraessExplainer(document);

    findButtonByText(document, "Not necessarily").click();
    findButtonByText(document, "Build the shortcut").click();
    findButtonByText(document, "Did your prediction hold up?").click();

    findButtonByText(document, "Start again").click();

    expect(isHidden(document.getElementById("opening-scene"))).toBe(false);
    expect(
      isHidden(document.getElementById("experiment")),
      "replay must return to a clean Act 1 — the experiment goes back behind the prediction gate",
    ).toBe(true);
    expect(isHidden(document.getElementById("reveal"))).toBe(true);
    expect(isHidden(document.getElementById("takeaway"))).toBe(true);
    expect(isHidden(document.getElementById("reveal-trigger"))).toBe(true);
    expect(
      isHidden(document.getElementById("build-shortcut")),
      "the build control must reappear after replay",
    ).toBe(false);
    expect(
      isHidden(document.getElementById("shortcut-status")),
      "the built status must hide again after replay",
    ).toBe(true);
    expect(
      document.activeElement?.id,
      "focus must return to the opening question",
    ).toBe("opening-question");

    expect(
      document.getElementById("prediction-comparison")?.textContent?.trim(),
      "the saved prediction must be cleared, not just hidden",
    ).toBe("");
    expect(
      document.getElementById("experiment-intro")?.textContent?.trim(),
      "the intro copy must be cleared so it can't leak the old prediction into the next run",
    ).toBe("");
    expect(
      document.getElementById("travel-time-output")?.textContent,
      "the network result must be cleared back to the no-shortcut state",
    ).toMatch(/\b65\b/);
    expect(isHidden(document.getElementById("unilateral-alternative"))).toBe(
      true,
    );

    for (const prediction of PREDICTIONS) {
      const button = findButtonByText(document, prediction);
      expect(
        button.hasAttribute("disabled"),
        `"${prediction}" must be re-enabled after replay`,
      ).toBe(false);
      expect(button.classList.contains("is-selected")).toBe(false);
    }

    // …and predicting again genuinely works, not just cosmetically reset.
    findButtonByText(document, "I'm not sure").click();
    expect(isHidden(document.getElementById("experiment"))).toBe(false);
  });

  // Regression: the traffic picture and the numbers beside it are two views
  // of one model state, so they must move together. Asserting on the edge
  // labels (not just the diagram's classes) also pins the non-visual channel
  // — the split must never be carried by the animation alone.
  it("shows traffic split across both original routes before the shortcut", async () => {
    const { initBraessExplainer } = await loadInteractionModule();
    const document = buildFixture();
    initBraessExplainer(document);

    findButtonByText(document, "Not necessarily").click();

    expect(
      document.getElementById("network-diagram")?.classList.contains(
        "is-shortcut-built",
      ),
      "the diagram must start in its split-traffic state",
    ).toBe(false);
    expect(document.getElementById("label-start-a")?.textContent).toMatch(
      /20 min.*2,000 cars/,
    );
    expect(document.getElementById("label-b-end")?.textContent).toMatch(
      /20 min.*2,000 cars/,
    );
    expect(
      document.getElementById("shortcut-label")?.textContent,
      "the shortcut doesn't exist yet, so its label must say so",
    ).toMatch(/not built/i);
  });

  it("moves all traffic onto the combined path once the shortcut exists", async () => {
    const { initBraessExplainer } = await loadInteractionModule();
    const document = buildFixture();
    initBraessExplainer(document);

    findButtonByText(document, "Not necessarily").click();
    findButtonByText(document, "Build the shortcut").click();

    expect(
      document.getElementById("network-diagram")?.classList.contains(
        "is-shortcut-built",
      ),
      "the diagram must switch to its combined-path state",
    ).toBe(true);
    expect(
      document.getElementById("label-a-end")?.textContent,
      "nobody finishes on the original route A once the shortcut exists",
    ).toMatch(/unused/i);
    expect(document.getElementById("label-start-b")?.textContent).toMatch(
      /unused/i,
    );
    expect(
      document.getElementById("shortcut-label")?.textContent,
      "all 4,000 drivers must be on the combined path",
    ).toMatch(/4,000 cars/);
    expect(document.getElementById("driver-count-note")?.textContent).toMatch(
      /combined path/i,
    );
  });

  // Regression: the on-edge labels used to stay symbolic ("x/100, then 45")
  // with no resolved value plugged in, so the diagram and the readout beside
  // it never visibly agreed with each other.
  it("plugs the real per-edge numbers and the equation into the diagram once the shortcut is built", async () => {
    const { initBraessExplainer } = await loadInteractionModule();
    const document = buildFixture();
    initBraessExplainer(document);

    findButtonByText(document, "Not necessarily").click();
    findButtonByText(document, "Build the shortcut").click();

    expect(document.getElementById("label-start-a")?.textContent).toMatch(
      /40 min.*4,000 cars/,
    );
    expect(document.getElementById("label-b-end")?.textContent).toMatch(
      /40 min.*4,000 cars/,
    );
    expect(
      document.getElementById("equation-readout")?.textContent,
      "the equation readout must spell out the built-state arithmetic",
    ).toMatch(/40 \+ 0 \+ 40 = 80/);

    // The two fixed 45-minute edges carry nobody now — the label says so
    // rather than showing a zero, and the "x/100" formula never appears.
    expect(document.getElementById("label-a-end")?.textContent).not.toMatch(
      /\//,
    );
  });

  it("restores the baseline equation and edge labels once the shortcut is removed", async () => {
    const { initBraessExplainer } = await loadInteractionModule();
    const document = buildFixture();
    initBraessExplainer(document);

    findButtonByText(document, "Not necessarily").click();
    const build = findButtonByText(document, "Build the shortcut");
    build.click();
    build.click();

    expect(
      document.getElementById("equation-readout")?.textContent,
    ).toMatch(/20 \+ 45 = 65/);
    expect(document.getElementById("label-start-a")?.textContent).toMatch(
      /20 min.*2,000 cars/,
    );
    expect(document.getElementById("label-a-end")?.textContent).toMatch(
      /2,000 cars/,
    );
  });

  it("replay puts the traffic back to the split view", async () => {
    const { initBraessExplainer } = await loadInteractionModule();
    const document = buildFixture();
    initBraessExplainer(document);

    findButtonByText(document, "Not necessarily").click();
    findButtonByText(document, "Build the shortcut").click();
    findButtonByText(document, "Start again").click();

    expect(
      document.getElementById("network-diagram")?.classList.contains(
        "is-shortcut-built",
      ),
    ).toBe(false);
    expect(document.getElementById("label-start-a")?.textContent).toMatch(
      /20 min.*2,000 cars/,
    );
    expect(document.getElementById("shortcut-label")?.textContent).toMatch(
      /not built/i,
    );
  });

  // Regression: the build control used to hide itself and retire into a
  // static "built" chip after one press, so there was no way back to the
  // baseline without a full replay. It's now a genuine toggle: it stays a
  // real, pressable button in both states, and #shortcut-status becomes a
  // companion indicator rather than a replacement for it.
  it("building the shortcut turns the control into a pressed toggle with a status chip alongside it", async () => {
    const { initBraessExplainer } = await loadInteractionModule();
    const document = buildFixture();
    initBraessExplainer(document);

    findButtonByText(document, "Not necessarily").click();
    const build = findButtonByText(document, "Build the shortcut");
    build.click();

    expect(
      isHidden(build),
      "the toggle must stay visible and pressable once the road exists",
    ).toBe(false);
    expect(build.getAttribute("aria-pressed")).toBe("true");
    expect(build.textContent?.trim()).toBe("Remove the shortcut");

    const status = document.getElementById("shortcut-status");
    expect(
      status,
      "a #shortcut-status element must report the built state",
    ).toBeTruthy();
    expect(isHidden(status)).toBe(false);
    expect(
      status?.tagName,
      "the built indicator must not itself be a button",
    ).not.toBe("BUTTON");
    expect(status?.textContent?.trim()).toMatch(/shortcut built/i);

    expect(
      document.activeElement?.id,
      "focus must stay on the toggle so it can immediately be flipped back with the keyboard",
    ).toBe("build-shortcut");
  });

  it("removing the shortcut returns the network to its 65-minute baseline", async () => {
    const { initBraessExplainer } = await loadInteractionModule();
    const document = buildFixture();
    initBraessExplainer(document);

    findButtonByText(document, "Not necessarily").click();
    const build = findButtonByText(document, "Build the shortcut");
    build.click();
    build.click();

    expect(build.getAttribute("aria-pressed")).toBe("false");
    expect(build.textContent?.trim()).toBe("Build the shortcut");
    expect(
      document.getElementById("travel-time-output")?.textContent,
      "removing the shortcut must bring the trip back down to 65",
    ).toMatch(/\b65\b/);
    expect(
      isHidden(document.getElementById("unilateral-alternative")),
      "the unilateral-alternative line only makes sense while the shortcut exists",
    ).toBe(true);
    expect(
      document.getElementById("network-diagram")?.classList.contains(
        "is-shortcut-built",
      ),
    ).toBe(false);
    expect(
      isHidden(document.getElementById("shortcut-status")),
      "the built chip must hide again once the shortcut is removed",
    ).toBe(true);
    expect(document.getElementById("label-start-a")?.textContent).toMatch(
      /20 min.*2,000 cars/,
    );

    // …and it can be built again from here, not just cosmetically reset.
    build.click();
    expect(document.getElementById("travel-time-output")?.textContent).toMatch(
      /\b80\b/,
    );
  });

  it("the reveal trigger, once earned, stays available after the shortcut is removed again", async () => {
    const { initBraessExplainer } = await loadInteractionModule();
    const document = buildFixture();
    initBraessExplainer(document);

    findButtonByText(document, "Not necessarily").click();
    const build = findButtonByText(document, "Build the shortcut");
    build.click();

    expect(
      isHidden(document.getElementById("reveal-trigger")),
      "building the shortcut must surface the reveal trigger",
    ).toBe(false);

    build.click();

    expect(
      isHidden(document.getElementById("reveal-trigger")),
      "the reveal trigger was earned by building at least once — removing the shortcut again must not take it away",
    ).toBe(false);

    findButtonByText(document, "Did your prediction hold up?").click();
    expect(isHidden(document.getElementById("reveal"))).toBe(false);
    expect(isHidden(document.getElementById("takeaway"))).toBe(false);
  });

  it("replay resets the toggle to its unbuilt state so the experiment can run again", async () => {
    const { initBraessExplainer } = await loadInteractionModule();
    const document = buildFixture();
    initBraessExplainer(document);

    findButtonByText(document, "Not necessarily").click();
    findButtonByText(document, "Build the shortcut").click();
    findButtonByText(document, "Start again").click();

    const build = document.getElementById("build-shortcut");
    expect(
      isHidden(build),
      "the toggle must be visible after replay",
    ).toBe(false);
    expect(build?.textContent?.trim()).toBe("Build the shortcut");
    expect(build?.getAttribute("aria-pressed")).toBe("false");
    expect(
      isHidden(document.getElementById("shortcut-status")),
      "the built status must hide again after replay",
    ).toBe(true);
    expect(
      isHidden(document.getElementById("reveal-trigger")),
      "replay must retract the reveal trigger too, not just the toggle",
    ).toBe(true);

    // …and it genuinely works a second time, not just cosmetically restored.
    findButtonByText(document, "I'm not sure").click();
    findButtonByText(document, "Build the shortcut").click();
    expect(document.getElementById("travel-time-output")?.textContent).toMatch(
      /\b80\b/,
    );
  });

  it("no choice skips the experiment or changes the underlying maths", async () => {
    const { initBraessExplainer } = await loadInteractionModule();

    const results = PREDICTIONS.map((prediction) => {
      const document = buildFixture();
      initBraessExplainer(document);
      findButtonByText(document, prediction).click();
      findButtonByText(document, "Build the shortcut").click();
      return {
        travelTime: document.getElementById("travel-time-output")?.textContent,
        unilateral: document.getElementById("unilateral-alternative")
          ?.textContent,
      };
    });

    const [first, ...rest] = results;
    for (const result of rest) {
      expect(
        result.travelTime,
        "every prediction must land in the same 80-minute equilibrium — the experiment's maths must not depend on what the visitor predicted",
      ).toBe(first?.travelTime);
      expect(result.unilateral).toBe(first?.unilateral);
    }
  });

  // Defensive: this state is unreachable through the UI (the trigger stays
  // hidden until the shortcut is built, which itself requires a prediction),
  // but the guard is what makes showPredictionCheck's "fill and reveal in
  // one step" assertion safe to rely on — it must never fire with nothing to
  // show, even if some future change manages to reach the trigger early.
  // Calling .click() directly bypasses the hidden attribute the same way it
  // does in "cannot build the shortcut before predicting" above.
  it("defensive: clicking the reveal-trigger without a saved prediction does nothing", async () => {
    const { initBraessExplainer } = await loadInteractionModule();
    const document = buildFixture();
    initBraessExplainer(document);

    document.getElementById("reveal-trigger")?.click();

    expect(
      isHidden(document.getElementById("reveal")),
      "the reveal must not appear without a saved prediction to show",
    ).toBe(true);
    expect(
      document.getElementById("prediction-comparison")?.textContent?.trim(),
    ).toBe("");
  });

  it("the three predictions produce three distinct feedback messages", async () => {
    const { initBraessExplainer } = await loadInteractionModule();

    const messages = PREDICTIONS.map((prediction) => {
      const document = buildFixture();
      initBraessExplainer(document);
      findButtonByText(document, prediction).click();
      findButtonByText(document, "Build the shortcut").click();
      findButtonByText(document, "Did your prediction hold up?").click();
      return (
        document.getElementById("prediction-comparison")?.textContent?.trim() ??
        ""
      );
    });

    for (const message of messages) {
      expect(
        message,
        "each prediction must produce non-empty feedback",
      ).not.toBe("");
    }

    // Echoing the prediction's own label back isn't itself a distinct
    // interpretation — strip each message's label out before comparing, so
    // this only passes when the actual explanation differs per prediction,
    // not just the quoted text within an otherwise-identical template.
    const interpretations = messages.map((message, i) =>
      message.split(PREDICTIONS[i]).join("«prediction»"),
    );
    expect(
      new Set(interpretations).size,
      "the three predictions must each get a genuinely different interpretation, not just their own label echoed into the same boilerplate",
    ).toBe(PREDICTIONS.length);
  });

  // Regression: the 65/80/85-minute figures used to sit flat in the feedback
  // sentence, no more prominent than the words around them.
  it("marks up the 65/80/85-minute figures in the feedback so they stand out from the surrounding sentence", async () => {
    const { initBraessExplainer } = await loadInteractionModule();
    const document = buildFixture();
    initBraessExplainer(document);

    findButtonByText(document, "Not necessarily").click();
    findButtonByText(document, "Build the shortcut").click();
    findButtonByText(document, "Did your prediction hold up?").click();

    const comparison = document.getElementById("prediction-comparison");
    const strongNumbers = [...(comparison?.querySelectorAll("strong") ?? [])]
      .map((el) => el.textContent?.trim())
      .filter((text): text is string => Boolean(text));

    expect(strongNumbers).toEqual(expect.arrayContaining(["65", "80", "85"]));
    // Marking numbers up must not change what's actually said — every test
    // above that asserts on this element's textContent must keep passing.
    expect(comparison?.textContent).toMatch(/65/);
    expect(comparison?.textContent).toMatch(/80/);
    expect(comparison?.textContent).toMatch(/85/);
  });

  it("feedback is careful: it doesn't ridicule the visitor or overstate the paradox", async () => {
    const { initBraessExplainer } = await loadInteractionModule();

    for (const prediction of PREDICTIONS) {
      const document = buildFixture();
      initBraessExplainer(document);
      findButtonByText(document, prediction).click();
      findButtonByText(document, "Build the shortcut").click();
      findButtonByText(document, "Did your prediction hold up?").click();

      const message =
        document.getElementById("prediction-comparison")?.textContent ?? "";

      expect(
        message,
        `feedback for "${prediction}" must not mock or scold the visitor`,
      ).not.toMatch(/wrong|mistake|silly|stupid|fool|dumb|obviously/i);

      expect(
        message,
        `feedback for "${prediction}" must not overstate the paradox into a universal rule`,
      ).not.toMatch(/(?:always|every (?:new )?road) makes? traffic worse/i);
    }
  });
});
