/**
 * tile-font
 *
 * The generative grid the whole design argues for. Display type in this app is not a
 * font file and not an image: it is glyph data on a coarse square cell grid plus a
 * renderer. See DESIGN.md section 4.
 *
 * Cell grid is 5 wide x 8 tall.
 *   rows 0-6  ascenders
 *   rows 2-6  x-height
 *   rows 2-7  descenders
 *
 * Lowercase only by design. Counters are formed by omitted squares.
 */

export const GLYPH_W = 5;
export const GLYPH_H = 8;

/** Empty columns between adjacent glyphs. Tight fitting: one, never more. */
export const DEFAULT_TRACKING = 1;

const G = (...rows: string[]): string[] => rows;

const GLYPHS: Record<string, string[]> = {
  " ": G(".....", ".....", ".....", ".....", ".....", ".....", ".....", "....."),

  a: G(".....", ".....", ".###.", "....#", ".####", "#...#", ".####", "....."),
  b: G("#....", "#....", "####.", "#...#", "#...#", "#...#", "####.", "....."),
  c: G(".....", ".....", ".###.", "#...#", "#....", "#...#", ".###.", "....."),
  d: G("....#", "....#", ".####", "#...#", "#...#", "#...#", ".####", "....."),
  e: G(".....", ".....", ".###.", "#...#", "#####", "#....", ".###.", "....."),
  f: G("..##.", ".#...", "####.", ".#...", ".#...", ".#...", ".#...", "....."),
  g: G(".....", ".....", ".####", "#...#", "#...#", ".####", "....#", ".###."),
  h: G("#....", "#....", "####.", "#...#", "#...#", "#...#", "#...#", "....."),
  i: G("..#..", ".....", ".##..", "..#..", "..#..", "..#..", ".###.", "....."),
  j: G("...#.", ".....", "..##.", "...#.", "...#.", "...#.", "#..#.", ".##.."),
  k: G("#....", "#....", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "....."),
  l: G(".##..", "..#..", "..#..", "..#..", "..#..", "..#..", ".###.", "....."),
  m: G(".....", ".....", "##.#.", "#.#.#", "#.#.#", "#.#.#", "#.#.#", "....."),
  n: G(".....", ".....", "####.", "#...#", "#...#", "#...#", "#...#", "....."),
  o: G(".....", ".....", ".###.", "#...#", "#...#", "#...#", ".###.", "....."),
  p: G(".....", ".....", "####.", "#...#", "#...#", "####.", "#....", "#...."),
  q: G(".....", ".....", ".####", "#...#", "#...#", ".####", "....#", "....#"),
  r: G(".....", ".....", "#.##.", "##..#", "#....", "#....", "#....", "....."),
  s: G(".....", ".....", ".####", "#....", ".###.", "....#", "####.", "....."),
  t: G(".#...", ".#...", "####.", ".#...", ".#...", ".#..#", "..##.", "....."),
  u: G(".....", ".....", "#...#", "#...#", "#...#", "#..##", ".##.#", "....."),
  v: G(".....", ".....", "#...#", "#...#", "#...#", ".#.#.", "..#..", "....."),
  w: G(".....", ".....", "#...#", "#...#", "#.#.#", "#.#.#", ".#.#.", "....."),
  x: G(".....", ".....", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "....."),
  y: G(".....", ".....", "#...#", "#...#", "#...#", ".####", "....#", ".###."),
  z: G(".....", ".....", "#####", "...#.", "..#..", ".#...", "#####", "....."),

  "0": G(".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###.", "....."),
  "1": G("..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###.", "....."),
  "2": G(".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####", "....."),
  "3": G("#####", "...#.", "..##.", "....#", "....#", "#...#", ".###.", "....."),
  "4": G("...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#.", "....."),
  "5": G("#####", "#....", "####.", "....#", "....#", "#...#", ".###.", "....."),
  "6": G("..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###.", "....."),
  "7": G("#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#...", "....."),
  "8": G(".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###.", "....."),
  "9": G(".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##..", "....."),

  ".": G(".....", ".....", ".....", ".....", ".....", ".....", ".#...", "....."),
  ",": G(".....", ".....", ".....", ".....", ".....", ".....", ".#...", "#...."),
  "-": G(".....", ".....", ".....", ".....", ".###.", ".....", ".....", "....."),
  "/": G(".....", "....#", "...#.", "...#.", "..#..", ".#...", "#....", "....."),
  ":": G(".....", ".....", ".....", "..#..", ".....", "..#..", ".....", "....."),
  "'": G("..#..", "..#..", ".....", ".....", ".....", ".....", ".....", "....."),
  "!": G("..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#..", "....."),
  "?": G(".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#..", "....."),
  "+": G(".....", ".....", ".....", "..#..", ".###.", "..#..", ".....", "....."),
};

/** One addressable square on the grid. `index` lets callers stagger cells individually. */
export interface TileCell {
  /** Column in cell units, from the left edge of the whole string. */
  col: number;
  /** Row in cell units, 0 at the top. */
  row: number;
  /** Index of the source character within the input string. */
  charIndex: number;
  /** Sequential index across all lit cells, in reading order. */
  index: number;
}

export interface TileLayout {
  cells: TileCell[];
  /** Total width in cell units. */
  cols: number;
  /** Total height in cell units. Always GLYPH_H. */
  rows: number;
  /** The source string, for the accessible text equivalent. */
  text: string;
}

/**
 * Resolve a string to grid coordinates. Unknown characters render as a space rather
 * than a tofu box, because a missing glyph should be quiet, not loud.
 */
export function layoutTileText(
  text: string,
  options: { tracking?: number } = {},
): TileLayout {
  const tracking = options.tracking ?? DEFAULT_TRACKING;
  const normalized = text.toLowerCase();

  const cells: TileCell[] = [];
  let cursor = 0;
  let index = 0;

  for (let charIndex = 0; charIndex < normalized.length; charIndex++) {
    const glyph = GLYPHS[normalized[charIndex]] ?? GLYPHS[" "];

    for (let row = 0; row < GLYPH_H; row++) {
      const line = glyph[row];
      for (let col = 0; col < GLYPH_W; col++) {
        if (line[col] === "#") {
          cells.push({ col: cursor + col, row, charIndex, index: index++ });
        }
      }
    }

    cursor += GLYPH_W;
    if (charIndex < normalized.length - 1) cursor += tracking;
  }

  return { cells, cols: Math.max(cursor, 0), rows: GLYPH_H, text };
}

/** Split into lines first, then lay each out. Useful for two-line subheads. */
export function layoutTileLines(
  lines: string[],
  options: { tracking?: number } = {},
): TileLayout[] {
  return lines.map((line) => layoutTileText(line, options));
}

/** True when the renderer has real geometry for this character. */
export function hasGlyph(char: string): boolean {
  return char.toLowerCase() in GLYPHS;
}
