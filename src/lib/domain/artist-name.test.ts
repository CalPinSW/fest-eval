import { describe, expect, it } from "vitest";
import { cleanDisplayName, isSameArtist, normalizeArtistName } from "./artist-name";

describe("normalizeArtistName", () => {
  it.each([
    ["Björk", "bjork"],
    ["Sigur Rós", "sigur ros"],
    ["The Cure", "cure"],
    ["Cure, The", "cure"],
    ["Florence + The Machine", "florence and the machine"],
    ["Florence & the Machine", "florence and the machine"],
    ["Guns N' Roses", "guns n roses"],
    ["Guns N’ Roses", "guns n roses"],
    ["  LCD   Soundsystem ", "lcd soundsystem"],
    ["AC/DC", "ac dc"],
    ["Fred again..", "fred again"],
    ["Jamie xx (DJ Set)", "jamie xx"],
    ["Four Tet [Live]", "four tet"],
    ["Bicep (live)", "bicep"],
    ["Ben UFO b2b Joy Orbison", "ben ufo b2b joy orbison"],
    ["The The", "the"],
    ["The", "the"],
    ["坂本龍一", "坂本龍一"],
    ["Motörhead", "motorhead"],
    ["P!nk", "p nk"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeArtistName(input)).toBe(expected);
  });

  it("keeps parentheses that are part of the name", () => {
    expect(normalizeArtistName("Sunn O)))")).toBe("sunn o");
    expect(normalizeArtistName("(Sandy) Alex G")).toBe("sandy alex g");
  });

  it("is idempotent", () => {
    for (const name of ["The Beatles", "Björk & Friends (DJ Set)", "AC/DC"]) {
      const once = normalizeArtistName(name);
      expect(normalizeArtistName(once)).toBe(once);
    }
  });

  it("keeps punctuation-only names rather than returning an empty key", () => {
    expect(normalizeArtistName("!!!")).toBe("!!!");
    expect(normalizeArtistName("  ")).toBe("");
  });
});

describe("isSameArtist", () => {
  it("matches decorated and undecorated names", () => {
    expect(isSameArtist("The Chemical Brothers", "Chemical Brothers (DJ Set)")).toBe(true);
  });

  it("does not match different artists", () => {
    expect(isSameArtist("Blur", "Blue")).toBe(false);
  });

  it("distinguishes punctuation-only names", () => {
    expect(isSameArtist("!!!", "???")).toBe(false);
    expect(isSameArtist("!!!", "!!!")).toBe(true);
  });

  it("never matches blank names", () => {
    expect(isSameArtist(" ", "")).toBe(false);
  });
});

describe("cleanDisplayName", () => {
  it("collapses whitespace", () => {
    expect(cleanDisplayName("  Idles \n live ")).toBe("Idles live");
  });
});
