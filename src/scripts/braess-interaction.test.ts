import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

// Tier C: the interaction contract from CLAUDE.md's Core interaction section,
// wired up by src/scripts/braess-interaction.ts's initBraessExplainer(root).
// Three acts, progressively revealed on one continuous page: predicting
// (Act 1) is a hard prerequisite for reaching the experiment (Act 2), and
// building the shortcut surfaces a trigger rather than immediately dumping
// the prediction check and takeaway (Act 3) — the visitor asks for those.
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

        <svg id="network-diagram">
          <path class="route route-a" />
          <path class="route route-a leg-idle" />
          <path class="route route-b leg-idle" />
          <path class="route route-b" />
          <path id="shortcut-path" class="route route-shortcut" />
          <text id="shortcut-label">Shortcut (not built)</text>
          <path class="flow flow-through" />
          <path class="flow flow-split" />
          <path class="flow flow-split" />
          <path class="flow flow-through" />
          <path class="flow flow-shortcut" />
        </svg>

        <dl>
          <div>
            <dt>Start → A → End</dt>
            <dd><span id="route-a-drivers">2,000 drivers</span></dd>
          </div>
          <div>
            <dt>Start → B → End</dt>
            <dd><span id="route-b-drivers">2,000 drivers</span></dd>
          </div>
          <div id="route-shortcut-row" hidden>
            <dt>Start → A → B → End</dt>
            <dd><span id="route-shortcut-drivers"></span></dd>
          </div>
        </dl>

        <p id="driver-count-note">4,000 drivers in total, split evenly.</p>

        <p role="status" id="travel-time-output">
          Current trip <strong>65</strong> minutes
        </p>
        <p id="unilateral-alternative" hidden>
          Going it alone instead would take <strong>85</strong> minutes.
        </p>
        <button type="button" id="build-shortcut">Build the shortcut</button>
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
  // of one model state, so they must move together. Asserting on the driver
  // counts (not just the diagram's classes) also pins the non-visual channel
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
    expect(document.getElementById("route-a-drivers")?.textContent).toBe(
      "2,000 drivers",
    );
    expect(document.getElementById("route-b-drivers")?.textContent).toBe(
      "2,000 drivers",
    );
    expect(
      isHidden(document.getElementById("route-shortcut-row")),
      "the combined path doesn't exist yet, so it must not be listed",
    ).toBe(true);
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
      document.getElementById("route-a-drivers")?.textContent,
      "nobody finishes on the original route A once the shortcut exists",
    ).toBe("0 drivers");
    expect(document.getElementById("route-b-drivers")?.textContent).toBe(
      "0 drivers",
    );
    expect(
      isHidden(document.getElementById("route-shortcut-row")),
      "the combined path must be listed once traffic uses it",
    ).toBe(false);
    expect(
      document.getElementById("route-shortcut-drivers")?.textContent,
      "all 4,000 drivers must be on the combined path",
    ).toBe("4,000 drivers");
    expect(document.getElementById("driver-count-note")?.textContent).toMatch(
      /combined path/i,
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
    expect(document.getElementById("route-a-drivers")?.textContent).toBe(
      "2,000 drivers",
    );
    expect(document.getElementById("route-b-drivers")?.textContent).toBe(
      "2,000 drivers",
    );
    expect(isHidden(document.getElementById("route-shortcut-row"))).toBe(true);
  });

  // Regression: the build control used to stay live and pressable after the
  // road existed, so pressing it again was a no-op dressed up as an action. A
  // disabled button still reads as one — this must retire into a plain,
  // non-interactive status, not a dead-looking button.
  it("retires the build control and shows a non-interactive built status once the road exists", async () => {
    const { initBraessExplainer } = await loadInteractionModule();
    const document = buildFixture();
    initBraessExplainer(document);

    findButtonByText(document, "Not necessarily").click();
    const build = findButtonByText(document, "Build the shortcut");
    build.click();

    expect(
      isHidden(build),
      "the build control must disappear once the road exists, not stay pressable",
    ).toBe(true);

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

    // Not merely "focus wasn't dropped to the body": it must stay inside the
    // experiment scene, or hiding the button scrolls the visitor away from
    // the very network change they pressed it to see.
    expect(
      document.activeElement?.id,
      "focus must land on the new result rather than being dropped by hiding the focused button",
    ).toBe("travel-time-output");
    expect(
      document.getElementById("experiment")?.contains(document.activeElement),
      "focus must not leave the experiment scene when the road is built",
    ).toBe(true);
  });

  it("a retired build control cannot re-run the experiment", async () => {
    const { initBraessExplainer } = await loadInteractionModule();
    const document = buildFixture();
    initBraessExplainer(document);

    findButtonByText(document, "Not necessarily").click();
    const build = findButtonByText(document, "Build the shortcut");
    build.click();

    const after = document.getElementById("travel-time-output")?.textContent;
    build.click();

    expect(
      document.getElementById("travel-time-output")?.textContent,
      "pressing the retired control again must leave the built network exactly as it was",
    ).toBe(after);
    expect(document.getElementById("route-shortcut-drivers")?.textContent).toBe(
      "4,000 drivers",
    );
  });

  it("replay restores the build control so the experiment can run again", async () => {
    const { initBraessExplainer } = await loadInteractionModule();
    const document = buildFixture();
    initBraessExplainer(document);

    findButtonByText(document, "Not necessarily").click();
    findButtonByText(document, "Build the shortcut").click();
    findButtonByText(document, "Start again").click();

    const build = document.getElementById("build-shortcut");
    expect(
      isHidden(build),
      "the build control must reappear after replay",
    ).toBe(false);
    expect(build?.textContent?.trim()).toBe("Build the shortcut");
    expect(
      isHidden(document.getElementById("shortcut-status")),
      "the built status must hide again after replay",
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
