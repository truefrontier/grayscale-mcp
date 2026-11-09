// "Tweak Hue" must wrap around the color wheel in both directions (PaletteRow.vue generateSwatches).
// Run after `npm run build`: imports the compiled dist/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PRESETS, buildLums, buildColors, generateSwatches } from '../dist/palette.js';
import * as Color from '../dist/site/color.js';

const lums = buildLums(PRESETS.default.getValues());
const snapshot = JSON.parse(readFileSync(new URL('./in-range-palettes.snapshot.json', import.meta.url), 'utf8'));

// Hue of each shade, and the shade index the base color sits on.
function shadeHues(hex, hue) {
  const { swatches, closestIndex } = generateSwatches(hex, lums, { hue, sat: 0 });
  return { ci: closestIndex, hues: swatches.map((s) => s.hsl[0]), swatches };
}

test('red with hue -50 turns magenta, not orange', () => {
  const { ci, hues, swatches } = shadeHues('#ff0000', -50);
  assert.equal(ci, 6);
  assert.deepEqual(hues, [60, 110, 160, 210, 260, 310, 0, 310, 260, 210, 160, 110]);
  // The rendered color one shade away reads as magenta too.
  const { h } = Color.RGBToHSL(...swatches[ci + 1].rgb);
  assert.ok(h >= 300 && h <= 320, `one step from red should be magenta, got hue ${h}`);
});

test('hue 350 with +50 wraps forward past 360', () => {
  const { ci, hues } = shadeHues('#ff002b', 50);
  assert.equal(ci, 6);
  assert.deepEqual(hues, [290, 240, 190, 140, 90, 40, 350, 40, 90, 140, 190, 240]);
});

test('a shade landing on exactly 360 is red, not gray', () => {
  const { ci, hues, swatches } = shadeHues('#ff00d4', 50);
  assert.equal(ci, 5);
  assert.equal(hues[ci + 1], 0);
  const [r, g, b] = swatches[ci + 1].rgb;
  assert.ok(r > g && r > b, `expected a red shade, got rgb(${r}, ${g}, ${b})`);
});

test('palettes whose hues stay in 0..360 match main', () => {
  const state = {
    lums: PRESETS.default.getValues(),
    palettes: [
      { hex: '#3b82f6' },
      { hex: '#ef4444', hue: 2.3, sat: -1.5 },
      { hex: '#10b981', name: 'brand', hue: -7.4, sat: 4.1 },
    ],
  };
  const { colors } = buildColors(state);
  // Snapshot of the same call on main a39284f, before this fix. Numbers are rounded to 4 places,
  // the finest the tools print (oklch). Unrounded, `lum` differs in its last digits between
  // Node 22 and Node 24+ (Math.pow), so an exact hash only matched one of them.
  const round4 = (k, v) => (typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : v);
  assert.deepEqual(JSON.parse(JSON.stringify(colors, round4)), snapshot);
  // Hues are printed unrounded (hsl export, json), so they must stay exactly main's `h + shift * steps`.
  for (const p of state.palettes) {
    const { swatches, baseHSL, closestIndex } = generateSwatches(p.hex, lums, { hue: p.hue ?? 0, sat: p.sat ?? 0 });
    assert.deepEqual(swatches.map((s) => s.hsl[0]), swatches.map((s, i) => baseHSL.h + (p.hue ?? 0) * Math.abs(closestIndex - i)));
  }
});
