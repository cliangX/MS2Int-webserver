import { type Page, type Locator } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class PtmModePage {
  readonly page: Page;
  readonly ptmTab: Locator;
  readonly container: Locator;
  readonly dropzone: Locator;
  readonly fileInput: Locator;
  readonly submitButton: Locator;
  readonly fileListCard: Locator;
  readonly fileTableCard: Locator;
  readonly progressCard: Locator;
  readonly resultCard: Locator;

  constructor(page: Page) {
    this.page = page;
    this.ptmTab = page.locator(".pixel-tab", { hasText: "PTM LOC" });
    // Scope all locators within the PTM container to avoid conflicts with other tabs
    this.container = page.locator(".space-y-4", {
      has: page.locator(".pixel-card-header", { hasText: "PTM LOCATION" }),
    });
    this.dropzone = this.container.locator(".pixel-dropzone");
    this.fileInput = this.container.locator('input[type="file"][multiple]');
    this.submitButton = this.container.locator(".pixel-btn-primary", { hasText: /START PTM LOCATION/ });
    this.fileListCard = this.container.locator(".pixel-card", { hasText: "UPLOADED FILES" });
    this.fileTableCard = this.container.locator(".pixel-card", { hasText: "FILE PARAMETERS" });
    this.progressCard = this.container.locator(".pixel-card", { hasText: "PIPELINE PROGRESS" });
    this.resultCard = this.container.locator(".pixel-card", { hasText: "RESULTS" }).last();
  }

  async goto() {
    await this.page.goto("/");
    await this.ptmTab.click();
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
