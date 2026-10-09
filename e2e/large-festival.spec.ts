import { expect, test } from "@playwright/test";
import { createLargeFestival, createUser, pick, signIn } from "./fixtures";

// Pages must only send what they show, however big the festival.
const BUDGET_BYTES = 450_000;

test("a festival with thousands of artists stays light and navigable", async ({ page }) => {
  test.setTimeout(120_000);
  const { festival, suffix } = await createLargeFestival(2500);
  const user = await createUser();
  await signIn(page, user, `/festivals/${festival.slug}`);
  await page.getByRole("button", { name: "I'm going" }).click();
  await expect(page.getByRole("button", { name: /Going · leave/ })).toBeVisible();

  const htmlSize = async (path: string) => (await (await page.request.get(path)).body()).length;
  for (const path of ["", "/timetable", "/edit", "/timetable?view=all&day=2027-06-26"]) {
    const size = await htmlSize(`/festivals/${festival.slug}${path}`);
    expect(size, `${path || "/"} is ${size} bytes`).toBeLessThan(BUDGET_BYTES);
  }

  // The lineup is paged.
  await page.reload();
  const lineup = page.getByRole("list", { name: "Lineup" });
  await expect(lineup.locator(":scope > li")).toHaveCount(100);
  await expect(page.getByText("Showing 1–100 of 2,500 artists")).toBeVisible();
  await page.getByRole("link", { name: "Next" }).click();
  await expect(page.getByText("Showing 101–200 of 2,500 artists")).toBeVisible();
  await expect(lineup.getByText(`Act 00100 ${suffix}`)).toBeVisible();

  // Search reaches artists on any page.
  await page.getByPlaceholder(/Search 2,500 artists/).fill(`Act 02499`);
  await page.getByPlaceholder(/Search 2,500 artists/).press("Enter");
  await expect(lineup.locator(":scope > li")).toHaveCount(1);

  // Picking from a later page shows up under "My picks".
  await pick(page, `Act 02499 ${suffix}`, "Must see");
  await page.goto(`/festivals/${festival.slug}?show=mine`);
  await expect(lineup.locator(":scope > li")).toHaveCount(1);
  await expect(page.getByPlaceholder(/Search 2,500 artists/)).toBeVisible();

  // The timetable shows a dozen stages at a time.
  await page.goto(`/festivals/${festival.slug}/timetable?day=2027-06-25&view=all`);
  const grid = page.getByRole("region", { name: "Timetable" });
  await expect(page.getByText("Stages 1–12 of 60")).toBeVisible();
  await expect(grid.getByRole("region", { name: "Stage 1", exact: true })).toBeVisible();
  await expect(grid.getByRole("region", { name: "Stage 13", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "More stages" }).click();
  await expect(page.getByText("Stages 13–24 of 60")).toBeVisible();
  await expect(grid.getByRole("region", { name: "Stage 13", exact: true })).toBeVisible();

  // "My plan" ignores stage paging: only picked sets are shown.
  await page.getByRole("link", { name: "My plan" }).click();
  await expect(page.getByRole("navigation", { name: "Stages" })).toHaveCount(0);
});
