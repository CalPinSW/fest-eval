import { expect, test } from "@playwright/test";
import { createFestivalWithLineup, createUser, signIn, uniq } from "./fixtures";

test("pages fit a phone screen; the timetable scrolls inside its own box", async ({ page }) => {
  const suffix = uniq();
  const festival = await createFestivalWithLineup(
    null,
    ["Main", "Tent", "Woods", "Bar"].map((stage, i) => ({
      artist: `Phone Act ${i} ${suffix}`,
      stage,
      start: "2027-07-02T18:00:00Z",
      end: "2027-07-02T19:00:00Z",
    })),
  );

  for (const path of ["/", "/festivals", "/login", "/signup", `/festivals/${festival.slug}`, `/festivals/${festival.slug}/timetable`]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);
  }

  const grid = page.getByRole("region", { name: "Timetable" });
  const scrollable = await grid.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(scrollable).toBe(true);
  await page.screenshot({ path: "test-results/screens/mobile-timetable.png" });
});

test("signed-in pages fit a phone screen", async ({ page }) => {
  const user = await createUser();
  await signIn(page, user);
  for (const path of ["/", "/friends", "/settings", "/festivals/new"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);
  }
});
