import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

// Tier A: the pure traffic model behind the Braess's-paradox explainer.
// calculateNetworkState() doesn't exist yet — these tests are the red state
// that names the contract in CLAUDE.md's Mathematical invariants section.
const MODEL_PATH = resolve("src/scripts/braess-model.ts");
const NOT_FOUND =
  "src/scripts/braess-model.ts not found — implement calculateNetworkState() " +
  "as a single pure function deriving allocation and travel times, per " +
  "CLAUDE.md's Mathematical invariants.";

async function loadModel() {
  // Checked and asserted before the import below, so a missing module fails
  // with this explanation instead of a raw resolution error. The specifier is
  // a computed file:// URL, not a string literal, so Vite's import-analysis
  // never tries to statically resolve it during transform — resolution stays
  // deferred to this runtime call, after the assertion above has already run.
  expect(existsSync(MODEL_PATH), NOT_FOUND).toBe(true);
  return import(/* @vite-ignore */ pathToFileURL(MODEL_PATH).href);
}

describe("braess-model: calculateNetworkState", () => {
  it("without the shortcut: 2,000/2,000 split at 65 minutes", async () => {
    const { calculateNetworkState } = await loadModel();
    const state = calculateNetworkState({ shortcutBuilt: false, totalDrivers: 4000 });

    expect(state.allocation).toEqual({
      viaNode1Only: 2000,
      viaNode2Only: 2000,
      viaShortcut: 0,
    });
    expect(state.equilibriumTravelTimeMinutes, "2000/100 + 45 = 65").toBe(65);
  });

  it("with the shortcut: all 4,000 drivers reroute, equilibrium is 80 minutes", async () => {
    const { calculateNetworkState } = await loadModel();
    const state = calculateNetworkState({ shortcutBuilt: true, totalDrivers: 4000 });

    expect(state.allocation).toEqual({
      viaNode1Only: 0,
      viaNode2Only: 0,
      viaShortcut: 4000,
    });
    expect(
      state.equilibriumTravelTimeMinutes,
      "4000/100 + 0 + 4000/100 = 80",
    ).toBe(80);
  });

  it("unilateral alternative after the shortcut is built takes 85 minutes", async () => {
    const { calculateNetworkState } = await loadModel();
    const state = calculateNetworkState({ shortcutBuilt: true, totalDrivers: 4000 });

    expect(
      state.unilateralAlternativeTimeMinutes,
      "4000/100 + 45 = 85",
    ).toBe(85);
  });

  it("has no unilateral-alternative figure when the shortcut isn't built", async () => {
    const { calculateNetworkState } = await loadModel();
    const state = calculateNetworkState({ shortcutBuilt: false, totalDrivers: 4000 });

    expect(state.unilateralAlternativeTimeMinutes).toBeNull();
  });

  it("derives times from totalDrivers rather than hard-coding 4000", async () => {
    const { calculateNetworkState } = await loadModel();
    const without = calculateNetworkState({ shortcutBuilt: false, totalDrivers: 2000 });
    const withShortcut = calculateNetworkState({ shortcutBuilt: true, totalDrivers: 2000 });

    expect(without.equilibriumTravelTimeMinutes, "1000/100 + 45 = 55").toBe(55);
    expect(
      withShortcut.equilibriumTravelTimeMinutes,
      "2000/100 + 2000/100 = 40",
    ).toBe(40);
    expect(
      withShortcut.unilateralAlternativeTimeMinutes,
      "2000/100 + 45 = 65",
    ).toBe(65);
  });

  it("conserves total flow: allocation sums to totalDrivers", async () => {
    const { calculateNetworkState } = await loadModel();
    for (const shortcutBuilt of [false, true]) {
      const state = calculateNetworkState({ shortcutBuilt, totalDrivers: 4000 });
      const total =
        state.allocation.viaNode1Only +
        state.allocation.viaNode2Only +
        state.allocation.viaShortcut;
      expect(
        total,
        `allocation should sum to 4000 drivers (shortcutBuilt=${shortcutBuilt})`,
      ).toBe(4000);
    }
  });

  it("demonstrates the paradox: worse equilibrium, yet individually rational to stay", async () => {
    const { calculateNetworkState } = await loadModel();
    const before = calculateNetworkState({ shortcutBuilt: false, totalDrivers: 4000 });
    const after = calculateNetworkState({ shortcutBuilt: true, totalDrivers: 4000 });

    expect(
      after.equilibriumTravelTimeMinutes,
      "collectively worse: 80 > 65",
    ).toBeGreaterThan(before.equilibriumTravelTimeMinutes);
    expect(
      after.unilateralAlternativeTimeMinutes,
      "individually irrational to deviate: 85 > 80",
    ).toBeGreaterThan(after.equilibriumTravelTimeMinutes);
  });
});
