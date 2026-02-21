import { test, expect } from "@playwright/test";
import { RescoreModePage } from "./pages/RescoreModePage";

// Mocked upload response — fast, no heavy pipeline
const MOCK_UPLOAD_RESPONSE = {
  session_id: "upl_test0001",
  uploaded_files: [
    { filename: "minimal_msms.txt", size_bytes: 512, type: "msms" },
    { filename: "TestRaw.mgf", size_bytes: 1024, type: "mgf" },
  ],
  msms_files: [
    { filename: "minimal_msms.txt", total_rows: 3, raw_files: ["TestRaw"] },
  ],
  raw_files: [
    { raw_file: "TestRaw", mgf_file: "TestRaw.mgf", msms_file: "minimal_msms.txt", psm_count: 3 },
  ],
  unmatched_mgf_files: [],
  errors: [],
};

const MOCK_SUBMIT_RESPONSE = {
  job_id: "rsc_test0001",
  status: "pending",
  total_steps: 6,
  created_at: new Date().toISOString(),
};

const MOCK_STATUS_RUNNING = {
  job_id: "rsc_test0001",
  status: "running",
  current_step: 2,
  total_steps: 6,
  step_message: "Generating SpecId ...",
  msms_total: 3,
  msms_filtered: 3,
  accepted_psms: 0,
  accepted_peptides: 0,
  elapsed_seconds: 5,
  error: null,
  result_files: [],
};

const MOCK_STATUS_COMPLETED = {
  job_id: "rsc_test0001",
  status: "completed",
  current_step: 6,
  total_steps: 6,
  step_message: "Done",
  msms_total: 3,
  msms_filtered: 3,
  accepted_psms: 2,
  accepted_peptides: 2,
  elapsed_seconds: 42,
  error: null,
  result_files: ["mokapot.psms.txt", "mokapot.peptides.txt"],
};

test.describe("Rescore Mode — UI", () => {
  let rp: RescoreModePage;

  test.beforeEach(async ({ page }) => {
    rp = new RescoreModePage(page);
    await rp.goto();
  });

  test("RESCORE tab is visible and navigates correctly", async ({ page }) => {
    await expect(rp.rescoreTab).toBeVisible();
    await expect(page.locator("text=Percolator Rescoring Pipeline")).toBeVisible();
    await expect(rp.dropzone).toBeVisible();
  });

  test("drop zone shows correct accept hint", async ({ page }) => {
    await expect(rp.dropzone).toContainText("msms.txt");
    await expect(rp.dropzone).toContainText(".mgf");
  });

  test("upload files shows file list and parameter table", async ({ page }) => {
    // Mock the upload API
    await page.route("**/api/rescore/upload", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_UPLOAD_RESPONSE),
      });
    });

    await rp.uploadFiles(["minimal_msms.txt", "TestRaw.mgf"]);
    await rp.waitForFileList();

    // File list should show uploaded files
    await expect(rp.fileListCard).toContainText("minimal_msms.txt");
    await expect(rp.fileListCard).toContainText("TestRaw.mgf");
    await expect(rp.fileListCard).toContainText("MSMS");
    await expect(rp.fileListCard).toContainText("MGF");

    // Parameter table should appear
    await expect(rp.fileTableCard).toBeVisible();
    await expect(rp.fileTableCard).toContainText("TestRaw");
    await expect(rp.fileTableCard).toContainText("minimal_msms.txt");
  });

  test("parameter table has correct columns", async ({ page }) => {
    await page.route("**/api/rescore/upload", (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_UPLOAD_RESPONSE) });
    });

    await rp.uploadFiles(["minimal_msms.txt", "TestRaw.mgf"]);
    await rp.waitForFileList();

    // Check column headers
    await expect(rp.fileTableCard).toContainText("RAW FILE");
    await expect(rp.fileTableCard).toContainText("SEARCH RESULT");
    await expect(rp.fileTableCard).toContainText("FRAGMENT");
    await expect(rp.fileTableCard).toContainText("CE");
  });

  test("START RESCORE button is visible after upload", async ({ page }) => {
    await page.route("**/api/rescore/upload", (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_UPLOAD_RESPONSE) });
    });

    await rp.uploadFiles(["minimal_msms.txt", "TestRaw.mgf"]);
    await rp.waitForFileList();

    await expect(rp.submitButton).toBeVisible();
  });

  test("submit starts pipeline and shows progress panel", async ({ page }) => {
    let statusCallCount = 0;

    await page.route("**/api/rescore/upload", (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_UPLOAD_RESPONSE) });
    });
    await page.route("**/api/rescore/submit", (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_SUBMIT_RESPONSE) });
    });
    await page.route("**/api/rescore/rsc_test0001", (route) => {
      statusCallCount++;
      const status = statusCallCount >= 2 ? MOCK_STATUS_COMPLETED : MOCK_STATUS_RUNNING;
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(status) });
    });

    await rp.uploadFiles(["minimal_msms.txt", "TestRaw.mgf"]);
    await rp.waitForFileList();
    await rp.submitButton.click();
    await rp.waitForProgress();

    await expect(rp.progressCard).toContainText("PIPELINE PROGRESS");
    await expect(rp.progressCard).toContainText("rsc_test0001");
  });

  test("completed pipeline shows result card with stats and download links", async ({ page }) => {
    let statusCallCount = 0;

    await page.route("**/api/rescore/upload", (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_UPLOAD_RESPONSE) });
    });
    await page.route("**/api/rescore/submit", (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_SUBMIT_RESPONSE) });
    });
    await page.route("**/api/rescore/rsc_test0001", (route) => {
      statusCallCount++;
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(statusCallCount >= 2 ? MOCK_STATUS_COMPLETED : MOCK_STATUS_RUNNING),
      });
    });

    await rp.uploadFiles(["minimal_msms.txt", "TestRaw.mgf"]);
    await rp.waitForFileList();
    await rp.submitButton.click();
    await rp.waitForResult();

    // Stats table
    await expect(rp.resultCard).toContainText("ACCEPTED PSMs");
    await expect(rp.resultCard).toContainText("2");
    await expect(rp.resultCard).toContainText("ELAPSED TIME");

    // Download buttons
    const downloadLinks = rp.resultCard.locator("a", { hasText: /MOKAPOT/ });
    await expect(downloadLinks.first()).toBeVisible();
  });

  test("upload error shows error message", async ({ page }) => {
    await page.route("**/api/rescore/upload", (route) => {
      route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ detail: "File too large" }) });
    });

    await rp.uploadFiles(["minimal_msms.txt"]);

    await expect(page.locator("text=File too large")).toBeVisible({ timeout: 5000 });
  });

  test("CANCEL button resets to idle state", async ({ page }) => {
    await page.route("**/api/rescore/upload", (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_UPLOAD_RESPONSE) });
    });

    await rp.uploadFiles(["minimal_msms.txt", "TestRaw.mgf"]);
    await rp.waitForFileList();

    const cancelBtn = page.locator(".pixel-btn", { hasText: "CANCEL" });
    await cancelBtn.click();

    // Should return to drop zone
    await expect(rp.dropzone).toBeVisible();
  });
});

test.describe("Rescore Mode — API upload (real server)", () => {
  test("POST /api/rescore/upload with minimal files returns session_id", async ({ request }) => {
    const msmsContent = "Raw file\tScan number\tSequence\tLength\tModifications\tModified sequence\tCharge\tScore\tReverse\nTestRaw\t1001\tPEPTIDEK\t8\tUnmodified\t_PEPTIDEK_\t2\t120\t\n";

    const mgfContent = "BEGIN IONS\nTITLE=TestRaw.raw scan=1001\nPEPMASS=453.2345\nCHARGE=2+\n100.1234 1000.0\nEND IONS\n";

    const form = new FormData();
    form.append("files", new Blob([msmsContent], { type: "text/plain" }), "minimal_msms.txt");
    form.append("files", new Blob([mgfContent], { type: "text/plain" }), "TestRaw.mgf");

    const res = await request.post("http://localhost:8000/api/rescore/upload", {
      multipart: form,
    });

    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty("session_id");
    expect(data.session_id).toMatch(/^upl_/);
    expect(data.uploaded_files).toHaveLength(2);
    expect(data.msms_files).toHaveLength(1);
    expect(data.raw_files).toHaveLength(1);
    expect(data.raw_files[0].raw_file).toBe("TestRaw");
  });
});
