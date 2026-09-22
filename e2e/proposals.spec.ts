import { expect, test } from "@playwright/test";
import { createFestivalWithLineup, createUser, signIn, uniq } from "./fixtures";

test("a community suggestion is reviewed and applied by the festival's editor", async ({ browser }) => {
  const [owner, fan] = await Promise.all([createUser("owner"), createUser("fan")]);
  const suffix = uniq();
  const festival = await createFestivalWithLineup(owner, [
    { artist: `Existing ${suffix}`, stage: "Main", start: "2027-07-02T19:00:00Z", end: "2027-07-02T20:00:00Z" },
  ]);
  const newArtist = `Surprise Guest ${suffix}`;

  const fanPage = await (await browser.newContext()).newPage();
  await signIn(fanPage, fan, `/festivals/${festival.slug}/edit`);
  await expect(fanPage.getByRole("link", { name: "Suggest an edit" })).toBeVisible();
  const form = fanPage.getByRole("form", { name: "Add a performance" });
  await form.getByLabel("Artist").fill(newArtist);
  await form.getByLabel("Stage").fill("Main");
  await form.getByLabel("Starts").fill("2027-07-02T22:00");
  await form.getByLabel("Ends").fill("2027-07-02T23:00");
  await form.getByLabel("Source").fill("https://example.com/announcement");
  await form.getByRole("button", { name: "Suggest this" }).click();
  await expect(fanPage.getByRole("status")).toContainText("will appear once an editor approves it");

  // Not on the lineup yet.
  await fanPage.goto(`/festivals/${festival.slug}`);
  await expect(fanPage.getByText(newArtist)).toHaveCount(0);

  const ownerPage = await (await browser.newContext()).newPage();
  await signIn(ownerPage, owner, `/festivals/${festival.slug}/proposals`);
  await expect(ownerPage.getByText(`Add ${newArtist}: Fri 2 Jul 22:00–23:00 · Main`)).toBeVisible();
  await expect(ownerPage.getByText(`Suggested by @${fan.username}`)).toBeVisible();
  await ownerPage.getByLabel("Note to the proposer").fill("Thanks, confirmed");
  await ownerPage.getByRole("button", { name: "Approve" }).click();
  // The suggestion moves from the queue to the reviewed list.
  await expect(ownerPage.getByRole("heading", { name: "Waiting for review (0)" })).toBeVisible();
  await expect(ownerPage.getByText("approved", { exact: true })).toBeVisible();

  await fanPage.reload();
  await expect(fanPage.getByText(newArtist)).toBeVisible();
  await fanPage.goto(`/festivals/${festival.slug}/proposals`);
  await expect(fanPage.getByText("approved", { exact: true })).toBeVisible();
  await expect(fanPage.getByText(/Reviewer: .Thanks, confirmed./)).toBeVisible();
});
