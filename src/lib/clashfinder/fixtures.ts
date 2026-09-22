/** A trimmed Clashfinder feed in the real format, shared by tests. */
export const sampleClashfinderFeed = {
  copyright: "Licensed under a Creative Commons Attribution-NonCommercial 3.0 License",
  modified: "2026-06-01 10:00",
  name: "Sample Fest 2026",
  id: "samplefest26",
  url: "https://clashfinder.com/s/samplefest26/",
  timezone: "Europe/London",
  tzOffset: 3600,
  auth: { result: "pass" },
  locations: [
    {
      name: "Main Stage",
      events: [
        { name: "The Opening Band", short: "openin(1)", start: "2026-06-26 18:00", end: "2026-06-26 19:00" },
        { name: "Headliner", short: "headli(1)", start: "2026-06-26 22:00", end: "2026-06-27 00:00" },
      ],
    },
    {
      name: "Tent",
      events: [
        { name: "Late DJ (DJ Set)", short: "latedj(1)", start: "2026-06-27 00:30", end: "2026-06-27 02:00" },
        { name: "Headliner", short: "headli(2)", start: "2026-06-27 15:00", end: "2026-06-27 16:00" },
      ],
    },
  ],
};
