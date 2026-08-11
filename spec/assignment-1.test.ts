import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

// A1-specific contract: CLAUDE.md's Assignment 1 intent / Core interaction /
// Mathematical invariants sections, for the Braess's-paradox explainer. Runs
// against the BUILT site (dist/), same convention as invariants.test.ts.
//
// Tier B only, and only its static/initial-state parts: control presence,
// keyboard operability, and the pre-interaction numbers. Tier C (clicking
// "Build the shortcut" and observing the display change) is deferred until
// the interaction module has a natural public boundary to test against — see
// the harness maintenance protocol in CLAUDE.md and spec/README.md.
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

describe("assignment 1: Braess's paradox explainer", () => {
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

  it("has a real prediction control the visitor can operate", () => {
    const controls = doc.querySelectorAll(
      'input[type="radio"], input[type="checkbox"], select, button[aria-pressed]',
    );
    expect(
      controls.length,
      "No native prediction control found — a bare clickable <div> isn't keyboard-operable.",
    ).toBeGreaterThan(0);
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

  it("has a visible, labelled region to report the travel time", () => {
    const region = doc.querySelector('[role="status"], [aria-live], output');
    expect(
      region,
      'No role="status"/aria-live/<output> region found to announce the travel time. Don\'t hide the value in a data attribute instead.',
    ).toBeTruthy();
    expect(region?.hasAttribute("hidden")).toBe(false);
    expect(region?.getAttribute("aria-hidden")).not.toBe("true");
  });

  it("shows the 2,000/2,000 split and 65-minute time before any interaction", () => {
    expect(doc.body.textContent).toMatch(/2,000/);
    expect(doc.body.textContent).toMatch(/\b65\b/);
  });

  it("does not start already in the post-shortcut state", () => {
    expect(doc.body.textContent).not.toMatch(/\b80\b\s*minutes/);
  });
});
