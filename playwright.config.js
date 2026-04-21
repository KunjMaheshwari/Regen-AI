const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    browserName: "chromium",
    ...devices["Desktop Chrome"],
    testIdAttribute: "data-testid",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
      },
    },
  ],
  webServer: {
    command: "node scripts/playwright-dev.mjs",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
