import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4175);
const host = "127.0.0.1";
const baseURL = `http://${host}:${port}/`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 10_000,
  expect: {
    timeout: 3_000
  },
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    actionTimeout: 2_000,
    navigationTimeout: 5_000,
    screenshot: "only-on-failure",
    trace: "off",
    video: "off",
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
    launchOptions: {
      args: ["--enable-unsafe-swiftshader"]
    }
  },
  webServer: {
    command: `npm run dev -- --host ${host} --port ${port} --strictPort`,
    url: baseURL,
    timeout: 15_000,
    reuseExistingServer: !process.env.CI
  }
});
