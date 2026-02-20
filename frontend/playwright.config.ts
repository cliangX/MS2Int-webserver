import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 1,
  reporter: "html",
  timeout: 30000,

  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: [
    {
      command:
        "cd ../backend && conda run -n mamba uvicorn app:app --host 0.0.0.0 --port 8000",
      url: "http://localhost:8000/api/health",
      reuseExistingServer: true,
      timeout: 120000,
    },
    {
      command: "npx vite --host 0.0.0.0 --port 5173",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      timeout: 30000,
    },
  ],
});
