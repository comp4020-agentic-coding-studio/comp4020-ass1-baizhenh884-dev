import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

// Tier C: the interaction contract from CLAUDE.md's Core interaction section
// — staged, full-viewport scenes wired up by a production interaction
// module. src/scripts/braess-interaction.ts doesn't exist yet; these tests
// are the red state that names its public boundary: initBraessExplainer(root).
//
// JSDOM doesn't execute <script src="..."> parsed from static HTML, so
// spec/assignment-1.test.ts (Tier B) can only check the markup an
// interaction script starts from. To test actual behaviour, this file
// builds its own DOM fixture that mirrors the staged-scene contract, then
// imports and calls the module's initializer directly against it — the same
// workaround braess-model.test.ts already uses for the pure model.
const MODULE_PATH = resolve("src/scripts/braess-interaction.ts");
const NOT_FOUND =
  "src/scripts/braess-interaction.ts not found — implement " +
  "initBraessExplainer(root) to wire up the staged scenes, per CLAUDE.md's " +
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
        <p role="status" id="travel-time-output">
          Current trip <strong>65</strong> minutes
        </p>
        <p id="unilateral-alternative" hidden>
          Going it alone instead would take <strong>85</strong> minutes.
        </p>
        <button type="button" id="build-shortcut">Build the shortcut</button>
      </section>

      <section id="reveal" hidden>
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
  it("starts with only the opening scene visible", async () => {
    const { initBraessExplainer } = await loadInteractionModule();
    const document = buildFixture();

    initBraessExplainer(document);

    expect(isHidden(document.getElementById("opening-scene"))).toBe(false);
    expect(isHidden(document.getElementById("experiment"))).toBe(true);
    expect(isHidden(document.getElementById("reveal"))).toBe(true);
    expect(isHidden(document.getElementById("takeaway"))).toBe(true);
  });

  for (const prediction of PREDICTIONS) {
    it(`recording "${prediction}" independently advances to the experiment scene and moves focus`, async () => {
      const { initBraessExplainer } = await loadInteractionModule();
      const document = buildFixture();
      initBraessExplainer(document);

      findButtonByText(document, prediction).click();

      expect(
        isHidden(document.getElementById("opening-scene")),
        "opening scene should hide once a prediction is recorded",
      ).toBe(true);
      expect(
        isHidden(document.getElementById("experiment")),
        "experiment scene should reveal once a prediction is recorded",
      ).toBe(false);
      expect(
        isHidden(document.getElementById("reveal")),
        "reveal must stay hidden until the shortcut is built",
      ).toBe(true);
      expect(
        document.activeElement?.id,
        "focus must move to the experiment heading on transition",
      ).toBe("experiment-heading");
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
    expect(isHidden(document.getElementById("experiment"))).toBe(true);
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
