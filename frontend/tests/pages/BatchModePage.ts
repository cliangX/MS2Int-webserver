import { type Page, type Locator, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class BatchModePage {
  readonly page: Page;
  readonly batchTab: Locator;
  readonly fileInput: Locator;
  readonly submitButton: Locator;
  readonly jobStatusCard: Locator;
  readonly progressBar: Locator;
  readonly downloadLink: Locator;
  readonly jobHistory: Locator;

  constructor(page: Page) {
    this.page = page;
    this.batchTab = page.locator(".pixel-tab", { hasText: "BATCH" });
    this.fileInput = page.locator('input[type="file"]');
    this.submitButton = page.locator(".pixel-btn-primary", { hasText: /SUBMIT/ });
    this.jobStatusCard = page.locator("text=JOB:").locator("..");
    this.progressBar = page.locator(".pixel-progress-bar");
    this.downloadLink = page.locator("a", { hasText: "DOWNLOAD" });
    this.jobHistory = page.locator("text=JOB HISTORY").locator("..");
  }

  async goto() {
    await this.page.goto("/");
    await this.batchTab.click();
  }

  async uploadFile(fixtureName: string) {
    const filePath = path.resolve(__dirname, "..", "fixtures", fixtureName);
    await this.fileInput.setInputFiles(filePath);
  }

  async submit() {
    await this.submitButton.click();
  }

  async waitForCompletion(timeout = 60000) {
    await this.page.locator("span", { hasText: /^COMPLETED$/ }).first().waitFor({ state: "visible", timeout });
  }

  async expectDownloadAvailable() {
    await expect(this.downloadLink).toBeVisible();
  }

  async getJobHistoryCount(): Promise<number> {
    const items = this.page.locator("[class*='border-2'][class*='cursor-pointer']");
    return items.count();
  }
}
