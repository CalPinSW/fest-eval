import { expect, test } from "@playwright/test";
import { createUser, signIn } from "./fixtures";

test("the Clashfinder cron endpoint rejects unauthenticated calls", async ({ request }) => {
  expect((await request.get("/api/cron/sync-clashfinder")).status()).toBe(401);
  const wrong = await request.get("/api/cron/sync-clashfinder", { headers: { Authorization: "Bearer nope" } });
  expect(wrong.status()).toBe(401);
});

test("streaming connection endpoints require sign-in", async ({ request }) => {
  expect((await request.get("/api/connect/apple-music")).status()).toBe(401);
  const post = await request.post("/api/connect/apple-music", { data: { musicUserToken: "x".repeat(20) } });
  expect(post.status()).toBe(401);
  const spotify = await request.get("/api/connect/spotify", { maxRedirects: 0 });
  expect(spotify.status()).toBe(307);
  expect(spotify.headers().location).toContain("/login");
});

test("a signed-in user sees which music services are available", async ({ page }) => {
  const user = await createUser();
  await signIn(page, user, "/settings");
  await expect(page.getByRole("heading", { name: "Music services" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Spotify" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Apple Music" })).toBeVisible();
});

test("Apple Music token storage refuses cross-site requests", async ({ page }) => {
  const user = await createUser();
  await signIn(page, user);
  const response = await page.request.post("/api/connect/apple-music", {
    headers: { Origin: "https://evil.example.com" },
    data: { musicUserToken: "x".repeat(20) },
  });
  expect(response.status()).toBe(403);
});
