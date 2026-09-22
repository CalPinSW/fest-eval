import { describe, expect, it } from "vitest";
import { safeNextPath } from "./redirects";
import { isProtectedPath } from "./supabase/proxy";

describe("safeNextPath", () => {
  it.each([
    ["/festivals/x", "/festivals/x"],
    ["/friends?tab=1", "/friends?tab=1"],
    [null, "/"],
    ["", "/"],
    ["https://evil.example.com", "/"],
    ["//evil.example.com", "/"],
    ["/\\evil.example.com", "/"],
    ["javascript:alert(1)", "/"],
  ])("%j -> %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});

describe("isProtectedPath", () => {
  it.each(["/friends", "/friends/", "/settings", "/admin", "/festivals/new", "/festivals/glasto/edit", "/festivals/glasto/proposals"])(
    "protects %s",
    (path) => expect(isProtectedPath(path)).toBe(true),
  );

  it.each(["/", "/festivals", "/festivals/glasto", "/festivals/glasto/timetable", "/login", "/friendship-bracelets"])(
    "leaves %s public",
    (path) => expect(isProtectedPath(path)).toBe(false),
  );
});
