import { type Page, type Locator, expect } from "@playwright/test";

export class SingleModePage {
  readonly page: Page;
  readonly singleTab: Locator;
  readonly sequenceInput: Locator;
  readonly chargeSelect: Locator;
  readonly ceSelect: Locator;
  readonly fragSelect: Locator;
  readonly predictButton: Locator;
  readonly spectrumImage: Locator;
  readonly ionTable: Locator;
  readonly ionRows: Locator;

  constructor(page: Page) {
    this.page = page;
    this.singleTab = page.locator(".pixel-tab", { hasText: "SINGLE" });
    this.sequenceInput = page.locator(".pixel-input").first();
    this.chargeSelect = page.locator(".pixel-select").nth(0);
    this.ceSelect = page.locator(".pixel-select").nth(1);
    this.fragSelect = page.locator(".pixel-select").nth(2);
    this.predictButton = page.locator(".pixel-btn-primary", { hasText: /PREDICT/ });
    this.spectrumImage = page.locator("img[alt^='Predicted spectrum']");
    this.ionTable = page.locator("table");
    this.ionRows = page.locator("table tbody tr");
  }

  async goto() {
    await this.page.goto("/");
    await this.singleTab.click();
  }

  async fillForm(seq: string, charge: number, ce: number, frag: string) {
    await this.sequenceInput.fill(seq);
    await this.chargeSelect.selectOption(String(charge));
    await this.ceSelect.selectOption(String(ce));
    await this.fragSelect.selectOption(frag);
  }

  async predict() {
    await this.predictButton.click();
  }

  async waitForResult(timeout = 20000) {
    await this.spectrumImage.waitFor({ state: "visible", timeout });
  }

  async getIonCount(): Promise<number> {
    return this.ionRows.count();
  }

  async expectSpectrumVisible() {
    await expect(this.spectrumImage).toBeVisible();
  }

  async expectIonTableHasRows(minRows = 1) {
    const count = await this.getIonCount();
    expect(count).toBeGreaterThanOrEqual(minRows);
  }

  getFilterButton(type: string): Locator {
    return this.page.locator("button", { hasText: new RegExp(`^${type}$`, "i") });
  }

  getExpandButton(): Locator {
    return this.page.locator(".pixel-btn", { hasText: /SHOW ALL|COLLAPSE/ });
  }

  getErrorToast(): Locator {
    return this.page.locator(".bg-destructive");
  }

  getSuccessToast(): Locator {
    return this.page.locator(".bg-success");
  }
}
