/**
 * Artist-name normalisation. The result is the de-duplication key for the
 * artists table and the join key when matching lineups against the artists a
 * user follows on a streaming service, so it must be stable: changing it
 * requires re-normalising `artists.normalized_name` and `liked_artists`.
 */
export function normalizeArtistName(name: string): string {
  const raw = name.replace(/\s+/g, " ").trim().toLowerCase();
  let s = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics: Björk -> Bjork
    .toLowerCase()
    .trim();

  // Clashfinder and promoters decorate names: "Artist (DJ Set)", "Artist [Live]".
  s = s.replace(/\s*[([][^)\]]*(dj set|live|b2b|acoustic|solo|band|set|special guest)[^)\]]*[)\]]\s*/g, " ");

  s = s
    .replace(/&/g, " and ")
    .replace(/\+/g, " and ")
    .replace(/['’`´]/g, "") // apostrophes join words: Guns N' Roses -> guns n roses
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  // "The Cure" and "Cure, The" are the same act. Keep a bare "The" intact.
  if (s.startsWith("the ") && s.length > 4) s = s.slice(4);
  if (s.endsWith(" the") && s.length > 4) s = s.slice(0, -4);

  // Punctuation-only names ("!!!") keep their raw form rather than vanishing.
  return s || raw;
}

/** True when two display names refer to the same artist. */
export function isSameArtist(a: string, b: string): boolean {
  const na = normalizeArtistName(a);
  return na.length > 0 && na === normalizeArtistName(b);
}

/** Tidy a user-supplied display name without changing its meaning. */
export function cleanDisplayName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}
