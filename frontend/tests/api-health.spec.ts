import { test, expect } from "@playwright/test";

const API = "http://localhost:8000";

test.describe("API Health", () => {
  test("GET /api/health returns ok with model loaded", async ({ request }) => {
    const res = await request.get(`${API}/api/health`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.model_loaded).toBe(true);
    expect(body.device).toContain("cuda");
  });

  test("GET /api/supported-modifications returns non-empty list", async ({ request }) => {
    const res = await request.get(`${API}/api/supported-modifications`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.modifications).toBeDefined();
    expect(body.modifications.length).toBeGreaterThan(0);
    expect(body.modifications).toContain("M[Oxidation]");
    expect(body.modifications).toContain("C[Carbamidomethyl]");
  });
});
