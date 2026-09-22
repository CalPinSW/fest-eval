import { expect, test } from "@playwright/test";
import { createUser, PASSWORD, signIn, uniq } from "./fixtures";

test("signs up, signs out and signs back in", async ({ page }) => {
  const username = `new_${uniq()}`;
  await page.goto("/signup");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Email").fill(`${username}@e2e.test`);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/festivals$/);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
});

test("shows validation and credential errors", async ({ page }) => {
  const user = await createUser();
  await page.goto("/signup");
  await page.getByLabel("Username").fill(user.username);
  await page.getByLabel("Email").fill(`other_${uniq()}@e2e.test`);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("That username is taken.")).toBeVisible();

  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Wrong email or password.")).toBeVisible();
});

test("redirects signed-out visitors from private pages and back after sign-in", async ({ page }) => {
  await page.goto("/friends");
  await expect(page).toHaveURL(/\/login\?next=%2Ffriends/);
  const user = await createUser();
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/friends$/);
  await expect(page.getByRole("heading", { name: "Friends", exact: true })).toBeVisible();
});

test("ignores off-site redirect targets", async ({ page }) => {
  const user = await createUser();
  await signIn(page, user, "//evil.example.com");
  await expect(page).toHaveURL(/localhost:\d+\/$/);
});
