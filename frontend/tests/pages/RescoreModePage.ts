import { type Page, type Locator, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class RescoreModePage {
  readonly page: Page;
  readonly rescoreTab: Locator;
  readonly dropzone: Locator;
  readonly fileInput: Locator;
  readonly submitButton: Locator;
  readonly fileListCard: Locator;
  readonly fileTableCard: Locator;
  readonly progressCard: Locator;
  readonly resultCard: Locator;

  constructor(page: Page) {
    this.page = page;
    this.rescoreTab = page.locator(".pixel-tab", { hasText: "RESCORE" });
    this.dropzone = page.locator(".pixel-dropzone");
    this.fileInput = page.locator('input[type="file"][multiple]');
    this.submitButton = page.locator(".pixel-btn-primary", { hasText: /START RESCORE/ });
    this.fileListCard = page.locator(".pixel-card", { hasText: "UPLOADED FILES" });
    this.fileTableCard = page.locator(".pixel-card", { hasText: "FILE PARAMETERS" });
    this.progressCard = page.locator(".pixel-card", { hasText: "PIPELINE PROGRESS" });
    this.resultCard = page.locator(".pixel-card", { hasText: "★ RESULTS" });
  }

  async goto() {
    await this.page.goto("/");
    await this.rescoreTab.click();
  }

  fixturePath(name: string): string {
    return path.resolve(__dirname, "..", "fixtures", name);
  }

  async uploadFiles(names: string[]) {
    const paths = names.map((n) => this.fixturePath(n));
    await this.fileInput.setInputFiles(paths);
  }

  async waitForFileList() {
    await this.fileListCard.waitFor({ state: "visible", timeout: 10000 });
  }

  async waitForProgress() {
    await this.progressCard.waitFor({ state: "visible", timeout: 10000 });
  }

  async waitForResult(timeout = 30000) {
    await this.resultCard.waitFor({ state: "visible", timeout });
  }
}
