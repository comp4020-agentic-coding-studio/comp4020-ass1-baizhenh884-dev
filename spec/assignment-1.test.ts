import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

// A1-specific contract: CLAUDE.md's Assignment 1 intent / Core interaction /
// Mathematical invariants sections, for the Braess's-paradox explainer. Runs
// against the BUILT site (dist/), same convention as invariants.test.ts.
//
// Tier B only, and only its static/initial-state parts: which scenes exist,
// which are hidden before any script runs, and which controls are real,
// native, keyboard-operable elements. This file can't run the interaction
// script (JSDOM doesn't execute <script src> from parsed HTML), so it can't
// prove anything about *visibility after a click* — only about the markup a
// visitor's browser (and the interaction script) starts from. The behavioural
// contract — recording a prediction in place, building the shortcut changing
// the numbers, reset returning to the start — lives in
// src/scripts/braess-interaction.test.ts instead.
const doc = new JSDOM(readFileSync(resolve("dist/index.html"), "utf8")).window
  .document;

function findByVisibleText<T extends Element>(
  selector: string,
  text: string,
): T | undefined {
  return [...doc.querySelectorAll<T>(selector)].find(
    (el) => el.textContent?.trim() === text,
  );
}

// Native `hidden` removes an element (and its descendants) from the render
// tree, the tab order, and the accessibility tree without any `tabindex`
// bookkeeping — so "does this start hidden" is "does it, or an ancestor,
// carry the `hidden` attribute right now".
function isEffectivelyHidden(el: Element | null): boolean {
  let node: Element | null = el;
  while (node) {
    if (node.hasAttribute("hidden")) return true;
    node = node.parentElement;
  }
  return false;
}

describe("assignment 1: Braess's paradox explainer", () => {
  const predictionButtons = [
    "Yes, I think so",
    "I'm not sure",
    "Not necessarily",
  ].map((label) => ({
    label,
    button: findByVisibleText<HTMLButtonElement>("button", label),
  }));

  it('has exactly three native prediction buttons: "Yes, I think so", "I\'m not sure", "Not necessarily"', () => {
    for (const { label, button } of predictionButtons) {
      expect(
        button,
        `No <button> with the exact visible text "${label}" was found. The opening scene needs three ordinary prediction actions.`,
      ).toBeTruthy();
      expect(
        button?.getAttribute("type"),
        `The "${label}" prediction must be type="button" — it's an immediate action, not a form submit.`,
      ).toBe("button");
      expect(
        button?.hasAttribute("aria-pressed"),
        `The "${label}" prediction is a one-shot action, not a persistent toggle, so it must not carry aria-pressed.`,
      ).toBe(false);
    }
  });

  it("the opening question and its prediction buttons are visible before any interaction", () => {
    for (const { label, button } of predictionButtons) {
      expect(
        button && !isEffectivelyHidden(button),
        `The "${label}" button must not start inside a hidden container.`,
      ).toBe(true);
    }

    const group = predictionButtons[0]?.button?.closest(
      "[aria-labelledby], fieldset, [role='group']",
    );
    expect(
      group,
      "The three prediction buttons must be grouped with an accessible group label (a <fieldset>, a role=\"group\", or an aria-labelledby container).",
    ).toBeTruthy();

    const labelledBy = group?.getAttribute("aria-labelledby");
    const question = labelledBy
      ? doc.getElementById(labelledBy)
      : group?.querySelector("legend");
    expect(
      question,
      "No accessible label found for the opening question.",
    ).toBeTruthy();
    expect(
      question && !isEffectivelyHidden(question),
      "The opening question must be visible before any interaction.",
    ).toBe(true);
  });

  it("the opening question asks about the general belief that more roads always improve traffic", () => {
    const group = predictionButtons[0]?.button?.closest(
      "[aria-labelledby], fieldset, [role='group']",
    );
    const labelledBy = group?.getAttribute("aria-labelledby");
    const question = labelledBy
      ? doc.getElementById(labelledBy)
      : group?.querySelector("legend");
    const questionText = question?.textContent ?? "";
    expect(
      questionText,
      "The opening question must be about roads.",
    ).toMatch(/road/i);
    expect(
      questionText,
      'The opening question must ask about the "always" framing of the belief — this contract is about testing a general belief, not a specific one-off scenario.',
    ).toMatch(/always/i);
  });

  it('has a real "Build the shortcut" button, not a decoration', () => {
    const button = findByVisibleText<HTMLButtonElement>(
      "button",
      "Build the shortcut",
    );
    expect(
      button,
      'No <button> with the exact visible text "Build the shortcut" was found. The Core interaction contract requires this exact, operable action.',
    ).toBeTruthy();
    expect(button?.hasAttribute("disabled")).toBe(false);
  });

  it("has a reset/replay control to return to the opening scene", () => {
    const replay = [...doc.querySelectorAll("button")].find((el) =>
      /replay|reset|start again|try again/i.test(el.textContent ?? ""),
    );
    expect(
      replay,
      'No reset/replay button found. CLAUDE.md\'s Core interaction requires a way to clear the saved prediction and result and return to the opening scene.',
    ).toBeTruthy();
  });

  it("the #experiment section is hidden before the visitor predicts", () => {
    const section = doc.getElementById("experiment");
    expect(
      section,
      'No element with id="experiment" found — the road-network experiment needs a stable id so the interaction script can update it in place.',
    ).toBeTruthy();
    expect(
      section?.hasAttribute("hidden"),
      "#experiment must start hidden: predicting is a hard prerequisite for reaching the experiment, not an independent action beside it.",
    ).toBe(true);
  });

  for (const id of ["reveal", "takeaway"]) {
    it(`the #${id} scene is hidden before the shortcut is built`, () => {
      const section = doc.getElementById(id);
      expect(
        section,
        `No element with id="${id}" found — each staged scene needs a stable id so the interaction script can reveal it.`,
      ).toBeTruthy();
      expect(
        section?.hasAttribute("hidden"),
        `#${id} must carry the native "hidden" attribute until the visitor builds the shortcut.`,
      ).toBe(true);
    });
  }

  it('has a "Did your prediction hold up?" trigger that starts hidden, gating Act 3', () => {
    const button = findByVisibleText<HTMLButtonElement>(
      "button",
      "Did your prediction hold up?",
    );
    expect(
      button,
      'No <button> with the exact visible text "Did your prediction hold up?" was found — Act 3 must be reached through an explicit trigger, not revealed automatically when the shortcut is built.',
    ).toBeTruthy();
    expect(
      button?.hasAttribute("hidden"),
      "#reveal-trigger must start hidden until the shortcut is built.",
    ).toBe(true);
  });

  it("has a non-interactive #shortcut-status indicator, starting hidden", () => {
    const status = doc.getElementById("shortcut-status");
    expect(
      status,
      'No element with id="shortcut-status" found — once the shortcut is built, the build button must retire into a plain status indicator rather than a disabled-but-button-shaped control.',
    ).toBeTruthy();
    expect(
      status?.hasAttribute("hidden"),
      "#shortcut-status must start hidden until the shortcut is built.",
    ).toBe(true);
    expect(
      status?.tagName,
      "#shortcut-status must not itself be a button — it's a status report, not an affordance.",
    ).not.toBe("BUTTON");
  });

  it("controls with click handlers are native interactive elements", () => {
    for (const el of doc.querySelectorAll("[onclick]")) {
      expect(
        ["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA"].includes(el.tagName),
        `<${el.tagName.toLowerCase()}> has a click handler but isn't natively interactive`,
      ).toBe(true);
    }
  });

  it("no interactive element is pulled out of tab order", () => {
    for (const el of doc.querySelectorAll("[tabindex]")) {
      expect(
        el.getAttribute("tabindex"),
        `<${el.tagName.toLowerCase()}> must not be removed from the tab order`,
      ).not.toBe("-1");
    }
  });

  it("has a labelled region, not itself hidden, to report the travel time", () => {
    // Targets #travel-time-output specifically, not just "the first
    // role=status region on the page" — the opening question also has its
    // own status region (#prediction-status) for announcing a saved
    // prediction, which legitimately starts hidden until one is made.
    const region = doc.getElementById("travel-time-output");
    expect(
      region,
      "No #travel-time-output region found to announce the travel time. Don't hide the value in a data attribute instead.",
    ).toBeTruthy();
    expect(
      region?.hasAttribute("role") || region?.hasAttribute("aria-live"),
      'The travel-time region must be announced via role="status" or aria-live.',
    ).toBeTruthy();
    expect(region?.hasAttribute("hidden")).toBe(false);
    expect(region?.getAttribute("aria-hidden")).not.toBe("true");
  });

  it("embeds the 2,000/2,000 split and 65-minute result in the built markup", () => {
    // These live inside the (already visible) experiment section — present
    // in the shipped HTML because they're computed once at build time, not
    // fabricated by a click. Presence here isn't a claim about visibility;
    // see the "already visible"/"hidden before the shortcut is built" tests
    // above for that.
    expect(doc.body.textContent).toMatch(/2,000/);
    expect(doc.body.textContent).toMatch(/\b65\b/);
  });

  it("does not start already in the post-shortcut state", () => {
    expect(doc.body.textContent).not.toMatch(/\b80\b\s*minutes/);
  });

  it("the final lesson communicates that adding a road does not always improve traffic", () => {
    const takeawayText = doc.getElementById("takeaway")?.textContent ?? "";
    expect(
      takeawayText,
      "The takeaway must mention roads.",
    ).toMatch(/road/i);
    expect(
      takeawayText,
      'The takeaway must state the "does not always improve traffic" lesson, not just describe this one network in isolation.',
    ).toMatch(/not always (?:improve|make .* (?:faster|better))/i);
  });

  it("the final lesson does not claim that every new road makes traffic worse", () => {
    const takeawayText = doc.getElementById("takeaway")?.textContent ?? "";
    // A sentence only counts as an overstated claim if it pairs an absolute
    // quantifier with "worse" and ISN'T itself a negation of that claim —
    // "doesn't always make traffic worse" is the correct, careful statement,
    // not the overstated one, so a plain substring match would misfire on it.
    const sentences = takeawayText.split(/(?<=[.!?])\s+/);
    const hasUnqualifiedWorseClaim = sentences.some((sentence) => {
      const hasAbsoluteQuantifier =
        /\balways\b/i.test(sentence) || /\bevery (?:new )?road\b/i.test(sentence);
      const claimsRoadsWorse =
        /\bworse\b/i.test(sentence) && /\broad/i.test(sentence);
      // "n't" has no word-boundary before the "n" in "isn't"/"doesn't", so a
      // \b-wrapped alternation would silently never match those contractions.
      const isNegated = /\bnot\b|\bnever\b|n't/i.test(sentence);
      return hasAbsoluteQuantifier && claimsRoadsWorse && !isNegated;
    });
    expect(
      hasUnqualifiedWorseClaim,
      'The takeaway must not overstate the paradox into a universal claim that roads always make traffic worse.',
    ).toBe(false);
  });
});
