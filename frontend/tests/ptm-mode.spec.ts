import { test, expect } from "@playwright/test";
import { PtmModePage } from "./pages/PtmModePage";

const MOCK_UPLOAD_RESPONSE = {
  session_id: "upl_ptm00001",
  uploaded_files: [
    { filename: "ptm_msms.txt", size_bytes: 512, type: "msms" },
    { filename: "TestRaw.mgf", size_bytes: 1024, type: "mgf" },
  ],
  msms_files: [
    { filename: "ptm_msms.txt", total_rows: 3, raw_files: ["TestRaw"], phospho_psm_count: 3 },
  ],
  raw_files: [
    { raw_file: "TestRaw", mgf_file: "TestRaw.mgf", msms_file: "ptm_msms.txt", phospho_psm_count: 3 },
  ],
  has_sty_file: false,
  sty_filename: "",
  unmatched_mgf_files: [],
  errors: [],
};

const MOCK_SUBMIT_RESPONSE = {
  job_id: "ptm_test0001",
  status: "pending",
  total_steps: 8,
  created_at: new Date().toISOString(),
};

const MOCK_STATUS_RUNNING = {
  job_id: "ptm_test0001",
  status: "running",
  current_step: 3,
  total_steps: 8,
  step_message: "Parsing MGF spectra ...",
  total_phospho_psms: 3,
  mono_phospho_psms: 3,
  td_candidates: 6,
  flr_1pct_psms: 0,
  flr_5pct_psms: 0,
  phosphosites_exported: 0,
  elapsed_seconds: 8,
  error: null,
  result_files: [],
};

const MOCK_STATUS_COMPLETED = {
  job_id: "ptm_test0001",
  status: "completed",
  current_step: 8,
  total_steps: 8,
  step_message: "Done",
  total_phospho_psms: 3,
  mono_phospho_psms: 3,
  td_candidates: 6,
  flr_1pct_psms: 2,
  flr_5pct_psms: 3,
  phosphosites_exported: 2,
  elapsed_seconds: 55,
  error: null,
  result_files: ["flr_curve.csv", "unique_psms.csv"],
};

test.describe("PTM Location Mode — UI", () => {
  let pp: PtmModePage;

  test.beforeEach(async ({ page }) => {
    pp = new PtmModePage(page);
    await pp.goto();
  });

  test("PTM LOC tab is visible and navigates correctly", async ({ page }) => {
    await expect(pp.ptmTab).toBeVisible();
    await expect(page.locator("text=Phosphorylation Site Localization")).toBeVisible();
    await expect(pp.dropzone).toBeVisible();
  });

  test("drop zone shows correct accept hint", async () => {
    await expect(pp.dropzone).toContainText("msms.txt");
    await expect(pp.dropzone).toContainText(".mgf");
    await expect(pp.dropzone).toContainText("Phospho(STY)Sites.txt");
  });

  test("upload files shows file list and parameter table", async ({ page }) => {
    await page.route("**/api/ptm/upload", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_UPLOAD_RESPONSE),
      });
    });

    await pp.uploadFiles(["ptm_msms.txt", "TestRaw.mgf"]);
    await pp.waitForFileList();

    await expect(pp.fileListCard).toContainText("ptm_msms.txt");
    await expect(pp.fileListCard).toContainText("TestRaw.mgf");
    await expect(pp.fileListCard).toContainText("MSMS");
    await expect(pp.fileListCard).toContainText("MGF");

    await expect(pp.fileTableCard).toBeVisible();
    await expect(pp.fileTableCard).toContainText("TestRaw");
    await expect(pp.fileTableCard).toContainText("ptm_msms.txt");
  });

  test("parameter table has correct columns and TARGET FLR input", async ({ page }) => {
    await page.route("**/api/ptm/upload", (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_UPLOAD_RESPONSE) });
    });

    await pp.uploadFiles(["ptm_msms.txt", "TestRaw.mgf"]);
    await pp.waitForFileList();

    await expect(pp.fileTableCard).toContainText("RAW FILE");
    await expect(pp.fileTableCard).toContainText("SEARCH RESULT");
    await expect(pp.fileTableCard).toContainText("FRAGMENT");
    await expect(pp.fileTableCard).toContainText("CE");
    await expect(pp.fileTableCard).toContainText("TARGET FLR");
  });

  test("START PTM LOCATION button is visible after upload", async ({ page }) => {
    await page.route("**/api/ptm/upload", (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_UPLOAD_RESPONSE) });
    });

    await pp.uploadFiles(["ptm_msms.txt", "TestRaw.mgf"]);
    await pp.waitForFileList();

    await expect(pp.submitButton).toBeVisible();
  });

  test("submit starts pipeline and shows progress panel", async ({ page }) => {
    let statusCallCount = 0;

    await page.route("**/api/ptm/upload", (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_UPLOAD_RESPONSE) });
    });
    await page.route("**/api/ptm/submit", (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_SUBMIT_RESPONSE) });
    });
    await page.route("**/api/ptm/ptm_test0001", (route) => {
      statusCallCount++;
      const status = statusCallCount >= 2 ? MOCK_STATUS_COMPLETED : MOCK_STATUS_RUNNING;
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(status) });
    });

    await pp.uploadFiles(["ptm_msms.txt", "TestRaw.mgf"]);
    await pp.waitForFileList();
    await pp.submitButton.click();
    await pp.waitForProgress();

    await expect(pp.progressCard).toContainText("PIPELINE PROGRESS");
    await expect(pp.progressCard).toContainText("ptm_test0001");
  });

  test("completed pipeline shows result card with FLR stats and download links", async ({ page }) => {
    let statusCallCount = 0;

    await page.route("**/api/ptm/upload", (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_UPLOAD_RESPONSE) });
    });
    await page.route("**/api/ptm/submit", (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_SUBMIT_RESPONSE) });
    });
    await page.route("**/api/ptm/ptm_test0001", (route) => {
      statusCallCount++;
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(statusCallCount >= 2 ? MOCK_STATUS_COMPLETED : MOCK_STATUS_RUNNING),
      });
    });

    await pp.uploadFiles(["ptm_msms.txt", "TestRaw.mgf"]);
    await pp.waitForFileList();
    await pp.submitButton.click();
    await pp.waitForResult();

    // FLR stats
    await expect(pp.resultCard).toContainText("TOTAL PHOSPHO PSMs");
    await expect(pp.resultCard).toContainText("MONO-PHOSPHO PSMs");
    await expect(pp.resultCard).toContainText("FLR");
    await expect(pp.resultCard).toContainText("ELAPSED TIME");

    // Download buttons
    const downloadLinks = pp.resultCard.locator("a", { hasText: /FLR_CURVE|UNIQUE_PSMS/ });
    await expect(downloadLinks.first()).toBeVisible();
  });

  test("upload error shows error message", async ({ page }) => {
    await page.route("**/api/ptm/upload", (route) => {
      route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ detail: "File too large" }) });
    });

    await pp.uploadFiles(["ptm_msms.txt"]);

    await expect(page.locator("text=File too large")).toBeVisible({ timeout: 5000 });
  });

  test("CANCEL button resets to idle state", async ({ page }) => {
    await page.route("**/api/ptm/upload", (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_UPLOAD_RESPONSE) });
    });

    await pp.uploadFiles(["ptm_msms.txt", "TestRaw.mgf"]);
    await pp.waitForFileList();

    const cancelBtn = page.locator(".pixel-btn", { hasText: "CANCEL" });
    await cancelBtn.click();

    await expect(pp.dropzone).toBeVisible();
  });
});

test.describe("PTM Location Mode — API upload (real server)", () => {
  test("POST /api/ptm/upload with phospho msms returns session_id and phospho counts", async ({ request }) => {
    const msmsContent =
      "Raw file\tScan number\tSequence\tLength\tModifications\tModified sequence\tCharge\tm/z\tMass\tScore\tReverse\n" +
      "TestRaw\t2001\tPEPTIDSK\t8\tPhospho (STY)\t_PEPT(ph)IDSK_\t2\t493.2\t984.4\t120\t\n" +
      "TestRaw\t2002\tAASPLRK\t7\tPhospho (STY)\t_AAS(ph)PLRK_\t2\t392.7\t783.4\t95\t\n";

    const mgfContent =
      "BEGIN IONS\nTITLE=TestRaw.raw scan=2001\nPEPMASS=493.2345\nCHARGE=2+\n100.1234 1000.0\n175.1190 800.5\nEND IONS\n" +
      "BEGIN IONS\nTITLE=TestRaw.raw scan=2002\nPEPMASS=392.7123\nCHARGE=2+\n70.0657 900.0\n129.0659 700.0\nEND IONS\n";

    const form = new FormData();
    form.append("files", new Blob([msmsContent], { type: "text/plain" }), "ptm_msms.txt");
    form.append("files", new Blob([mgfContent], { type: "text/plain" }), "TestRaw.mgf");

    const res = await request.post("http://localhost:8000/api/ptm/upload", {
      multipart: form,
    });

    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty("session_id");
    expect(data.session_id).toMatch(/^upl_/);
    expect(data.uploaded_files).toHaveLength(2);
    expect(data.msms_files).toHaveLength(1);
    expect(data.msms_files[0].phospho_psm_count).toBe(2);
    expect(data.raw_files).toHaveLength(1);
    expect(data.raw_files[0].raw_file).toBe("TestRaw");
    expect(data.raw_files[0].phospho_psm_count).toBe(2);
    expect(data.has_sty_file).toBe(false);
  });
});
