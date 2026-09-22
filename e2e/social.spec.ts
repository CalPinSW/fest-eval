import { expect, test } from "@playwright/test";
import { createFestivalWithLineup, createUser, signIn, uniq } from "./fixtures";

test("friends going to the same festival see each other's picks", async ({ browser }) => {
  const [alice, bob] = await Promise.all([createUser("alice"), createUser("bob")]);
  const suffix = uniq();
  const artist = `Shared Fave ${suffix}`;
  const festival = await createFestivalWithLineup(null, [
    { artist, stage: "Main", start: "2027-07-02T19:00:00Z", end: "2027-07-02T20:00:00Z" },
    { artist: `Other Act ${suffix}`, stage: "Main", start: "2027-07-02T20:30:00Z", end: "2027-07-02T21:30:00Z" },
  ]);

  const alicePage = await (await browser.newContext()).newPage();
  const bobPage = await (await browser.newContext()).newPage();
  await signIn(alicePage, alice, "/friends");
  await signIn(bobPage, bob, "/friends");

  // Alice sends a request; Bob accepts.
  const addForm = alicePage.getByRole("form", { name: "Add a friend" });
  await addForm.getByPlaceholder("Their username").fill(bob.username);
  await addForm.getByRole("button", { name: "Send request" }).click();
  await expect(alicePage.getByRole("status")).toHaveText(`Request sent to ${bob.username}.`);

  await bobPage.reload();
  await bobPage.getByRole("button", { name: `Accept @${alice.username}` }).click();
  await expect(bobPage.getByRole("list", { name: "Your friends" })).toContainText(`@${alice.username}`);

  // Both go; Bob picks the artist as a must-see.
  for (const page of [alicePage, bobPage]) {
    await page.goto(`/festivals/${festival.slug}`);
    await page.getByRole("button", { name: "I'm going" }).click();
    await expect(page.getByRole("button", { name: /Going · leave/ })).toBeVisible();
  }
  await bobPage
    .getByRole("radiogroup", { name: `How much do you want to see ${artist}?` })
    .getByRole("radio", { name: "Must see" })
    .click();
  await expect(
    bobPage.getByRole("radiogroup", { name: `How much do you want to see ${artist}?` }).getByRole("radio", { name: "Must see" }),
  ).toHaveAttribute("aria-checked", "true");

  await expect(bobPage.locator('[role="radiogroup"][aria-busy="true"]')).toHaveCount(0);
  await alicePage.reload();
  await expect(alicePage.getByText(`1 friend going:`)).toBeVisible();
  await expect(alicePage.getByLabel(`Friends: ${bob.username} (Must see)`)).toBeVisible();

  await alicePage.getByRole("link", { name: "Friends' picks" }).click();
  await expect(alicePage.getByRole("list", { name: "Lineup" }).locator(":scope > li")).toHaveCount(1);

  await alicePage.getByRole("link", { name: "Timetable" }).click();
  await expect(
    alicePage.getByRole("region", { name: "Timetable" }).getByRole("article", { name: new RegExp(`${artist}.*1 friend want to go`) }),
  ).toBeVisible();
});

test("a stranger cannot see anyone's picks", async ({ page }) => {
  const [picker, stranger] = await Promise.all([createUser("picker"), createUser("stranger")]);
  const suffix = uniq();
  const artist = `Secret Fave ${suffix}`;
  const festival = await createFestivalWithLineup(null, [
    { artist, stage: "Main", start: "2027-07-02T19:00:00Z", end: "2027-07-02T20:00:00Z" },
  ]);

  await signIn(page, picker, `/festivals/${festival.slug}`);
  await page.getByRole("button", { name: "I'm going" }).click();
  await page.getByRole("radiogroup", { name: `How much do you want to see ${artist}?` }).getByRole("radio", { name: "Must see" }).click();
  await expect(
    page.getByRole("radiogroup", { name: `How much do you want to see ${artist}?` }).getByRole("radio", { name: "Must see" }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(page.locator('[role="radiogroup"][aria-busy="true"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();

  await signIn(page, stranger, `/festivals/${festival.slug}`);
  await page.getByRole("button", { name: "I'm going" }).click();
  await expect(page.getByLabel(/^Friends:/)).toHaveCount(0);
  await expect(page.getByText(/friends? going/)).toHaveCount(0);
});
