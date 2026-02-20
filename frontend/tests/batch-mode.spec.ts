import { test, expect } from "@playwright/test";
import { BatchModePage } from "./pages/BatchModePage";

test.describe("Batch Mode", () => {
  let bp: BatchModePage;

  test.beforeEach(async ({ page }) => {
    bp = new BatchModePage(page);
    await bp.goto();
  });

  test("upload valid CSV and see job status", async () => {
    await bp.uploadFile("valid_3rows.csv");
    await bp.submit();
    // Should show job status card with JOB: prefix
    await bp.page.locator("text=JOB:").waitFor({ state: "visible", timeout: 10000 });
  });

  test("batch job completes and download available", async () => {
    await bp.uploadFile("valid_3rows.csv");
    await bp.submit();
    await bp.waitForCompletion(60000);
    await bp.expectDownloadAvailable();
  });

  test("download link returns valid response", async ({ request }) => {
    const csvContent = "Sequence,Charge,collision_energy,Fragmentation\nPEPTIDEK,2,30,HCD\n";
    const submitRes = await request.post("http://localhost:8000/api/jobs/submit", {
      multipart: {
        file: {
          name: "test.csv",
          mimeType: "text/csv",
          buffer: Buffer.from(csvContent),
        },
      },
    });
    expect(submitRes.ok()).toBeTruthy();
    const { job_id } = await submitRes.json();

    // Poll until done
    for (let i = 0; i < 30; i++) {
      const statusRes = await request.get(`http://localhost:8000/api/jobs/${job_id}`);
      const status = await statusRes.json();
      if (status.status === "completed") break;
      if (status.status === "failed") throw new Error(status.error);
      await new Promise((r) => setTimeout(r, 2000));
    }

    const dlRes = await request.get(`http://localhost:8000/api/jobs/${job_id}/download`);
    expect(dlRes.ok()).toBeTruthy();
    const contentType = dlRes.headers()["content-type"] || "";
    expect(contentType).toMatch(/octet-stream|hdf5/);
  });

  test("tab switch preserves state", async ({ page }) => {
    // Go to single mode first and predict
    const singleTab = page.locator(".pixel-tab", { hasText: "SINGLE" });
    await singleTab.click();
    const predictBtn = page.locator(".pixel-btn-primary", { hasText: /PREDICT/ });
    await predictBtn.click();
    await page.locator("img[alt^='Predicted spectrum']").waitFor({ state: "visible", timeout: 20000 });

    // Switch to batch
    const batchTab = page.locator(".pixel-tab", { hasText: "BATCH" });
    await batchTab.click();
    await expect(page.locator("text=UPLOAD CSV")).toBeVisible();

    // Switch back to single — spectrum should still be there
    await singleTab.click();
    await expect(page.locator("img[alt^='Predicted spectrum']")).toBeVisible();
  });
});
