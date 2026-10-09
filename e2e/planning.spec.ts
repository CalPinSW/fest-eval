import { expect, test } from "@playwright/test";
import { createFestivalWithLineup, createUser, pick, signIn, uniq } from "./fixtures";

test("creates a festival, builds a lineup, picks artists and plans the day", async ({ page }) => {
  const user = await createUser();
  await signIn(page, user, "/festivals/new");

  const name = `Planner Fest ${uniq()}`;
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("First day").fill("2027-07-02");
  await page.getByLabel("Last day").fill("2027-07-04");
  await page.getByRole("button", { name: "Create festival" }).click();
  await expect(page).toHaveURL(/\/edit$/);
  await expect(page.getByRole("heading", { name })).toBeVisible();

  const suffix = uniq();
  const sets = [
    { artist: `Headliner ${suffix}`, stage: "Main", start: "2027-07-02T21:00", end: "2027-07-02T22:30" },
    { artist: `Clasher ${suffix}`, stage: "Tent", start: "2027-07-02T21:30", end: "2027-07-02T22:30" },
    { artist: `Opener ${suffix}`, stage: "Main", start: "2027-07-02T18:00", end: "2027-07-02T19:00" },
  ];
  const addForm = page.getByRole("form", { name: "Add a performance" });
  for (const set of sets) {
    await addForm.getByLabel("Artist").fill(set.artist);
    await addForm.getByLabel("Stage").fill(set.stage);
    await addForm.getByLabel("Starts").fill(set.start);
    await addForm.getByLabel("Ends").fill(set.end);
    await addForm.getByRole("button", { name: "Add to lineup" }).click();
    await expect(page.getByText(set.artist)).toBeVisible();
  }
  await addForm.getByLabel("Artist").fill(`Mystery ${suffix}`);
  await addForm.getByRole("button", { name: "Add to lineup" }).click();
  await expect(page.getByText(`Mystery ${suffix}`)).toBeVisible();

  await page.getByRole("link", { name: "Lineup", exact: true }).click();
  await expect(page.getByText(`Fri 2 Jul 21:00–22:30 · Main`)).toBeVisible();

  await page.getByRole("button", { name: "I'm going" }).click();
  await expect(page.getByRole("button", { name: /Going · leave/ })).toBeVisible();

  await pick(page, `Headliner ${suffix}`, "Must see");
  await pick(page, `Clasher ${suffix}`, "Want to see");
  await pick(page, `Opener ${suffix}`, "Maybe");
  await expect(
    page.getByRole("radiogroup", { name: `How much do you want to see Headliner ${suffix}?` }).getByRole("radio", { name: "Must see" }),
  ).toHaveAttribute("aria-checked", "true");

  // Picks persist across reloads once saved.
  await page.reload();
  await expect(
    page.getByRole("radiogroup", { name: `How much do you want to see Clasher ${suffix}?` }).getByRole("radio", { name: "Want to see" }),
  ).toHaveAttribute("aria-checked", "true");

  await page.getByRole("link", { name: "My picks" }).click();
  await expect(page.getByRole("list", { name: "Lineup" }).locator(":scope > li")).toHaveCount(3);

  await page.getByRole("link", { name: "Timetable" }).click();
  const grid = page.getByRole("region", { name: "Timetable" });
  await expect(grid.getByRole("region", { name: "Main" })).toBeVisible();
  await expect(grid.getByRole("article", { name: new RegExp(`Headliner ${suffix}, 21:00–22:30, your pick: Must see`) })).toBeVisible();
  await expect(page.getByText(`Times not announced: Mystery ${suffix}`)).toBeVisible();

  await page.getByRole("link", { name: "My plan" }).click();
  await expect(grid.getByRole("article", { name: new RegExp(`Headliner ${suffix}.*in your plan`) })).toBeVisible();
  await expect(grid.getByRole("article", { name: new RegExp(`Clasher ${suffix}.*clashes with your plan`) })).toBeVisible();
  await expect(page.getByText(`Clasher ${suffix} (Want to see) loses to Headliner ${suffix}`)).toBeVisible();
  await page.screenshot({ path: "test-results/screens/timetable-plan.png", fullPage: true });
});

test("shows the timetable across festival days, keeping late sets on the previous day", async ({ page }) => {
  const suffix = uniq();
  const festival = await createFestivalWithLineup(null, [
    { artist: `Friday Band ${suffix}`, stage: "Main", start: "2027-07-02T19:00:00Z", end: "2027-07-02T20:00:00Z" },
    { artist: `Late DJ ${suffix}`, stage: "Tent", start: "2027-07-03T00:30:00Z", end: "2027-07-03T02:00:00Z" },
    { artist: `Saturday Band ${suffix}`, stage: "Main", start: "2027-07-03T15:00:00Z", end: "2027-07-03T16:00:00Z" },
  ]);
  await page.goto(`/festivals/${festival.slug}/timetable`);

  const days = page.getByRole("navigation", { name: "Days" });
  await expect(days.getByRole("link")).toHaveText(["Fri 2 Jul", "Sat 3 Jul"]);
  const grid = page.getByRole("region", { name: "Timetable" });
  await expect(grid.getByRole("article", { name: new RegExp(`Late DJ ${suffix}, 01:30–03:00`) })).toBeVisible();
  await expect(grid.getByText(`Saturday Band ${suffix}`)).toHaveCount(0);

  await days.getByRole("link", { name: "Sat 3 Jul" }).click();
  await expect(grid.getByText(`Saturday Band ${suffix}`)).toBeVisible();
  // Signed-out visitors see the timetable but not plan controls.
  await expect(page.getByRole("navigation", { name: "View" })).toHaveCount(0);
});
