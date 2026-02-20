import { test, expect } from "@playwright/test";
import { SingleModePage } from "./pages/SingleModePage";

test.describe("Single Mode", () => {
  let sp: SingleModePage;

  test.beforeEach(async ({ page }) => {
    sp = new SingleModePage(page);
    await sp.goto();
  });

  test("default prediction (PEPTIDEK/2+/30/HCD)", async () => {
    await sp.predict();
    await sp.waitForResult();
    await sp.expectSpectrumVisible();
    await sp.expectIonTableHasRows(5);
  });

  test("modified peptide ([Acetyl]-ALLS[Phospho]LATHK/3+/25/HCD)", async () => {
    await sp.fillForm("[Acetyl]-ALLS[Phospho]LATHK", 3, 25, "HCD");
    await sp.predict();
    await sp.waitForResult();
    await sp.expectSpectrumVisible();
    await sp.expectIonTableHasRows(1);
  });

  test("CID fragmentation", async () => {
    await sp.fillForm("PEPTIDEK", 2, 30, "CID");
    await sp.predict();
    await sp.waitForResult();
    await sp.expectSpectrumVisible();
  });

  test("all charge values return results", async () => {
    for (const charge of [1, 2, 3, 4, 5, 6]) {
      await sp.fillForm("PEPTIDEK", charge, 30, "HCD");
      await sp.predict();
      await sp.waitForResult();
      await sp.expectSpectrumVisible();
    }
  });

  test("all CE values return results", async () => {
    for (const ce of [10, 20, 23, 25, 26, 27, 28, 29, 30, 35, 40, 42]) {
      await sp.fillForm("PEPTIDEK", 2, ce, "HCD");
      await sp.predict();
      await sp.waitForResult();
      await sp.expectSpectrumVisible();
    }
  });

  test("empty sequence disables predict button", async () => {
    await sp.sequenceInput.fill("");
    await expect(sp.predictButton).toBeDisabled();
  });

  test("invalid sequence shows error toast", async () => {
    await sp.fillForm("123!!!", 2, 30, "HCD");
    await sp.predict();
    const toast = sp.getErrorToast();
    await toast.waitFor({ state: "visible", timeout: 10000 });
    await expect(toast).toBeVisible();
  });

  test("ion table expand/collapse toggle", async () => {
    await sp.predict();
    await sp.waitForResult();
    const expandBtn = sp.getExpandButton();
    if (await expandBtn.isVisible()) {
      const countBefore = await sp.getIonCount();
      await expandBtn.click();
      const countAfter = await sp.getIonCount();
      expect(countAfter).toBeGreaterThanOrEqual(countBefore);
      await expandBtn.click();
      const countCollapsed = await sp.getIonCount();
      expect(countCollapsed).toBeLessThanOrEqual(countAfter);
    }
  });

  test("ion type filter buttons work", async () => {
    await sp.predict();
    await sp.waitForResult();
    const allCount = await sp.getIonCount();
    expect(allCount).toBeGreaterThan(0);

    const bBtn = sp.getFilterButton("B");
    if (await bBtn.isVisible()) {
      await bBtn.click();
      const bCount = await sp.getIonCount();
      expect(bCount).toBeLessThanOrEqual(allCount);

      const allBtn = sp.getFilterButton("ALL");
      await allBtn.click();
      const resetCount = await sp.getIonCount();
      expect(resetCount).toBe(allCount);
    }
  });
});
