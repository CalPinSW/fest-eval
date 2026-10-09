import { expect, test } from "@playwright/test";
import { createLargeFestival } from "./fixtures";

test("the timetable scrolls inside a screen-sized box with pinned stage names and times", async ({ page }) => {
  const { festival } = await createLargeFestival(600, 20);
  await page.goto(`/festivals/${festival.slug}/timetable?day=2027-06-25`);

  const grid = page.getByRole("region", { name: "Timetable" });
  const viewport = page.viewportSize()!;
  // The whole box, including its bottom scrollbar, is on screen without scrolling the page.
  await expect(async () => {
    const fitted = (await grid.boundingBox())!;
    expect(fitted.y + fitted.height).toBeLessThanOrEqual(viewport.height);
  }).toPass();

  // Both directions scroll inside the box, so its scrollbars are on screen.
  const dims = await grid.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight }));
  expect(dims.sw).toBeGreaterThan(dims.cw);
  expect(dims.sh).toBeGreaterThan(dims.ch);

  // Scroll down and right: stage names stay at the top, times stay at the left.
  const box = (await grid.boundingBox())!;
  await grid.evaluate((el) => el.scrollTo({ top: 500, left: 400 }));
  const stageHeading = grid.getByRole("heading", { name: "Stage 4", exact: true });
  await expect(stageHeading).toBeInViewport();
  const headingBox = (await stageHeading.boundingBox())!;
  expect(Math.abs(headingBox.y - box.y)).toBeLessThan(3);
  const timeLabel = grid.getByText("16:00", { exact: true });
  const labelBox = (await timeLabel.boundingBox())!;
  expect(labelBox.x - box.x).toBeLessThan(60);

  // The page itself doesn't scroll sideways.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: "test-results/screens/timetable-scrolled.png" });
});

test("on a phone the timetable fits the screen and scrolls inside itself", async ({ browser }) => {
  const { festival } = await createLargeFestival(300, 12);
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.goto(`/festivals/${festival.slug}/timetable?day=2027-06-25`);
  const grid = page.getByRole("region", { name: "Timetable" });
  await expect(async () => {
    const box = (await grid.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(844);
  }).toPass();
  expect(await grid.evaluate((el) => el.scrollWidth > el.clientWidth && el.scrollHeight > el.clientHeight)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: "test-results/screens/timetable-phone.png" });
  await page.close();
});
