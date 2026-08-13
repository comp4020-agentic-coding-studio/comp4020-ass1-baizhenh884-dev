import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

// Tier C: the interaction contract from CLAUDE.md's Core interaction section,
// wired up by src/scripts/braess-interaction.ts's initBraessExplainer(root).
// The opening question and the road-network experiment sit on the page
// together from the start; predicting and building the shortcut are
// independent actions that each update the same continuous page in place,
// rather than switching between isolated screens.
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
        <p id="prediction-status" hidden></p>
      </div>

      <section id="experiment">
        <h2 id="experiment-heading" tabindex="-1">The network, right now</h2>

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
  it("starts with the opening question and the experiment both visible", async () => {
    const { initBraessExplainer } = await loadInteractionModule();
    const document = buildFixture();

    initBraessExplainer(document);

    expect(isHidden(document.getElementById("opening-scene"))).toBe(false);
    expect(
      isHidden(document.getElementById("experiment")),
      "the experiment must already be visible, not gated behind a prediction",
    ).toBe(false);
    expect(isHidden(document.getElementById("reveal"))).toBe(true);
    expect(isHidden(document.getElementById("takeaway"))).toBe(true);
  });

  for (const prediction of PREDICTIONS) {
    it(`recording "${prediction}" saves it in place without hiding the question or the experiment`, async () => {
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
        "the experiment must stay visible after predicting",
      ).toBe(false);
      expect(
        isHidden(document.getElementById("reveal")),
        "reveal must stay hidden until the shortcut is built",
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

      const status = document.getElementById("prediction-status");
      expect(isHidden(status), "the saved prediction must be announced").toBe(
        false,
      );
      expect(status?.textContent?.toLowerCase()).toContain(
        prediction.toLowerCase(),
      );
    });
  }

  for (const prediction of PREDICTIONS) {
    it(`preserves the "${prediction}" prediction for the later comparison`, async () => {
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

      expect(isHidden(document.getElementById("reveal"))).toBe(false);
      expect(isHidden(document.getElementById("takeaway"))).toBe(false);

      const comparison = document.getElementById("prediction-comparison");
      expect(
        comparison?.textContent?.toLowerCase(),
        `the comparison must reference the saved "${prediction}" prediction, not just the outcome`,
      ).toContain(prediction.toLowerCase());
    });
  }

  it("reset/replay clears the saved prediction and result and returns focus to the opening question", async () => {
    const { initBraessExplainer } = await loadInteractionModule();
    const document = buildFixture();
    initBraessExplainer(document);

    findButtonByText(document, "Not necessarily").click();
    findButtonByText(document, "Build the shortcut").click();

    findButtonByText(document, "Start again").click();

    expect(isHidden(document.getElementById("opening-scene"))).toBe(false);
    expect(
      isHidden(document.getElementById("experiment")),
      "the experiment stays visible after replay, just reset to its baseline",
    ).toBe(false);
    expect(isHidden(document.getElementById("reveal"))).toBe(true);
    expect(isHidden(document.getElementById("takeaway"))).toBe(true);
    expect(
      document.activeElement?.id,
      "focus must return to the opening question",
    ).toBe("opening-question");

    expect(
      document.getElementById("prediction-comparison")?.textContent?.trim(),
      "the saved prediction must be cleared, not just hidden",
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
    expect(
      isHidden(document.getElementById("prediction-status")),
      "the prediction announcement must be cleared and hidden after replay",
    ).toBe(true);
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
  // road existed, so pressing it again was a no-op dressed up as an action.
  it("retires the build control into a completed state once the road exists", async () => {
    const { initBraessExplainer } = await loadInteractionModule();
    const document = buildFixture();
    initBraessExplainer(document);

    findButtonByText(document, "Not necessarily").click();
    const build = findButtonByText(document, "Build the shortcut");
    build.click();

    expect(
      build.hasAttribute("disabled"),
      "the build control must not stay pressable once the road exists",
    ).toBe(true);
    expect(
      build.textContent?.trim(),
      "the control must read as a completed state, not as an action still on offer",
    ).not.toBe("Build the shortcut");
    expect(build.textContent?.trim()).toMatch(/built/i);
    // Not merely "focus wasn't dropped to the body": it must stay inside the
    // experiment scene, or activating the button scrolls the visitor away
    // from the very network change they pressed it to see.
    expect(
      document.activeElement?.id,
      "focus must land on the new result rather than being dropped by disabling the focused button",
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
    expect(build?.hasAttribute("disabled")).toBe(false);
    expect(build?.textContent?.trim()).toBe("Build the shortcut");

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

  it("building the shortcut without ever predicting still shows the correct result", async () => {
    const { initBraessExplainer } = await loadInteractionModule();
    const document = buildFixture();
    initBraessExplainer(document);

    findButtonByText(document, "Build the shortcut").click();

    expect(document.getElementById("travel-time-output")?.textContent).toMatch(
      /\b80\b/,
    );
    expect(isHidden(document.getElementById("reveal"))).toBe(false);
    expect(isHidden(document.getElementById("takeaway"))).toBe(false);
    expect(
      document.getElementById("prediction-comparison")?.textContent?.trim(),
      "with no saved prediction there's nothing to compare, so this must stay empty rather than fabricate feedback",
    ).toBe("");
  });

  it("the three predictions produce three distinct feedback messages", async () => {
    const { initBraessExplainer } = await loadInteractionModule();

    const messages = PREDICTIONS.map((prediction) => {
      const document = buildFixture();
      initBraessExplainer(document);
      findButtonByText(document, prediction).click();
      findButtonByText(document, "Build the shortcut").click();
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
