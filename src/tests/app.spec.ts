import { expect, test } from "@playwright/test";

test("reports a clear WebGPU requirement instead of leaving a blank screen", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "gpu", { configurable: true, value: undefined });
  });

  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "WEBGPU REQUIRED" })).toBeVisible();
  await expect(page.getByText(/WebGPU is unavailable/i)).toBeVisible();
  await expect(page).toHaveTitle(/PILLARBALL/i);
  expect(pageErrors).toEqual([]);
});

test("development smoke harness covers keyboard menu, pause, options, reset, and restart", async ({
  page
}) => {
  await page.goto("/?smoke-ui=1");
  await expect(page.getByRole("heading", { name: /BALL PILLAR/i })).toBeVisible();

  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Game status" })).toBeVisible();
  await page.getByRole("button", { name: "Jump" }).click();
  await expect(page.locator("#smoke-status")).toHaveAttribute("data-jump-count", "1");

  await page.keyboard.press("r");
  await expect(page.locator("#smoke-status")).toHaveAttribute("data-reset-count", "1");

  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "SIGNAL PAUSED" })).toBeVisible();

  await page.locator(".pause-menu").getByRole("button", { name: "OPTIONS" }).click();
  await expect(page.getByRole("heading", { name: "OPTIONS" })).toBeVisible();
  await page.locator("select[data-setting='aspectMode']").selectOption("4:3");
  await page.locator(".options-menu").getByRole("button", { name: "BACK" }).click();
  await expect(page.getByRole("heading", { name: "SIGNAL PAUSED" })).toBeVisible();

  await page.locator(".pause-menu").getByRole("button", { name: "RESTART CHECKPOINT" }).click();
  await expect(page.getByRole("region", { name: "Game status" })).toBeVisible();
  await expect(page.locator("#smoke-status")).toHaveAttribute("data-restart-count", "1");
});

test("campaign level select places training before the final Pillar Works course", async ({ page }) => {
  await page.goto("/?smoke-ui=1");
  const levelSelect = page.getByRole("menuitem", { name: "02 LEVEL SELECT" });
  await expect(levelSelect).toBeVisible();
  await levelSelect.click();

  await expect(page.getByRole("heading", { name: "LEVEL SELECT" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /01 ROLL TRAINING/i })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /05 PILLAR WORKS/i })).toBeDisabled();

  await page.getByRole("menuitem", { name: /01 ROLL TRAINING/i }).click();
  await expect(page.getByRole("region", { name: "Game status" })).toBeVisible();
  await expect(page.locator("#smoke-status")).toHaveAttribute("data-selected-level", "roll-training");
});
