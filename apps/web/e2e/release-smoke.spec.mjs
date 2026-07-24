import { expect, test } from "@playwright/test";

const adminEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL;
const adminPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD;

async function login(page) {
  test.skip(!adminEmail || !adminPassword, "Set PLAYWRIGHT_ADMIN_EMAIL and PLAYWRIGHT_ADMIN_PASSWORD for authenticated browser checks.");
  await page.goto("/login");
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByLabel("Password").fill(adminPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/(dashboard|calls)$/);
}

test("public homepage and login form render without an infinite loader", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "CallQuanta" })).toBeVisible();
  await page.goto("/login");
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByText("Checking session...")).toHaveCount(0);
});

test("invalid login shows an actionable error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("invalid@example.invalid");
  await page.getByLabel("Password").fill("invalid");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator(".notice-danger")).toBeVisible();
});

test("protected route redirects once to login", async ({ page }) => {
  await page.goto("/calls");
  await expect(page).toHaveURL(/\/login\?next=%2Fcalls$/);
  await expect(page.getByLabel("Email")).toBeVisible();
});

test("RU switch persists on the public login page", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Language:").selectOption("ru");
  await expect(page.getByRole("button", { name: "Войти" })).toBeVisible();
  await expect(page.getByText("Проверка сессии...")).toHaveCount(0);
});

test("successful login persists after refresh and logout clears the session", async ({ page }) => {
  await login(page);
  await page.reload();
  await expect(page.getByRole("button", { name: "Logout" })).toBeVisible();
  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page).toHaveURL(/\/login(?:\?next=%2Fdashboard)?$/);
  await expect(page.getByLabel("Email")).toBeVisible();
});
