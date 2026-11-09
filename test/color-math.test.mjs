// The vendored color math (src/site/color.js) that every palette, export and tool uses.
// These pin what the MCP relies on, so a re-copy from grayscale.design that changes it shows up here.
// Run after `npm run build`: imports the compiled dist/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closestLum, hexToRGB, HSLtoRGB, lightnessFromHSLum, lumFromRGB, RGBFromLum, RGBToHex, RGBToHSL } from '../dist/site/color.js';

const rgbOf = (i) => [i >> 16, (i >> 8) & 255, i & 255];

test('hexToRGB then RGBToHex returns the same 6-digit hex', () => {
  for (let i = 0; i < 1 << 24; i += 257) {
    const hex = '#' + i.toString(16).padStart(6, '0');
    const { r, g, b } = hexToRGB(hex);
    assert.equal(RGBToHex(Number(r), Number(g), Number(b)), hex);
  }
});

test('hexToRGB expands 3-digit hex, and its channels coerce to numbers', () => {
  const { r, g, b } = hexToRGB('#3bf');
  assert.deepEqual([Number(r), Number(g), Number(b)], [0x33, 0xbb, 0xff]);
  assert.equal(RGBToHex(59.4, 130.5, 246.49), '#3b83f6'); // RGBToHex rounds each channel
});

test('RGBToHSL: integer hue 0-359, saturation and lightness 0-100 to one decimal', () => {
  for (let i = 0; i < 1 << 24; i += 97) {
    const { h, s, l } = RGBToHSL(...rgbOf(i));
    assert.ok(Number.isInteger(h) && h >= 0 && h <= 359, `h=${h} for ${rgbOf(i)}`);
    for (const v of [s, l]) assert.ok(v >= 0 && v <= 100 && Math.round(v * 10) === v * 10, `s/l=${v} for ${rgbOf(i)}`);
  }
  assert.deepEqual(RGBToHSL(128, 128, 128), { h: 0, s: 0, l: 50.2 });
  assert.deepEqual(RGBToHSL(59, 130, 246), { h: 217, s: 91.2, l: 59.8 });
});

test('HSLtoRGB at the primaries, white, black and gray', () => {
  assert.deepEqual(HSLtoRGB(0, 100, 50), { r: 255, g: 0, b: 0 });
  assert.deepEqual(HSLtoRGB(120, 100, 50), { r: 0, g: 255, b: 0 });
  assert.deepEqual(HSLtoRGB(240, 100, 50), { r: 0, g: 0, b: 255 });
  assert.deepEqual(HSLtoRGB(200, 100, 100), { r: 255, g: 255, b: 255 });
  assert.deepEqual(HSLtoRGB(200, 100, 0), { r: 0, g: 0, b: 0 });
  assert.deepEqual(HSLtoRGB(200, 0, 50), { r: 128, g: 128, b: 128 });
});

test('RGB -> HSL -> RGB is off by at most 2 per channel (the HSL rounding)', () => {
  let worst = 0;
  for (let i = 0; i < 1 << 24; i += 977) {
    const [r, g, b] = rgbOf(i);
    const { h, s, l } = RGBToHSL(r, g, b);
    const o = HSLtoRGB(h, s, l);
    worst = Math.max(worst, Math.abs(o.r - r), Math.abs(o.g - g), Math.abs(o.b - b));
  }
  assert.ok(worst <= 2, `worst channel error ${worst}`);
});

// HSLtoRGB has a branch for each 60-degree band below 360 and none for 360 itself, so 360 falls through to
// gray (black at s=100, l=50). RGBToHSL never returns 360, but a caller adding hue can land on it. The
// overflow branches strict-colors (parseColorInput: a % 360) and hue-wrap (generateSwatches) wrap to 0 first.
test('HSLtoRGB(360, ...) equals HSLtoRGB(0, ...)', { todo: 'color.js has no branch for h = 360; callers wrap to 0' }, () => {
  assert.deepEqual(HSLtoRGB(360, 100, 50), HSLtoRGB(0, 100, 50));
});

test('lumFromRGB is WCAG relative luminance on a 0-100 scale, rising in every channel', () => {
  assert.equal(lumFromRGB(0, 0, 0), 0);
  assert.equal(lumFromRGB(255, 255, 255), 100);
  // 0.2126 * 0.0438 + 0.7152 * 0.2232 + 0.0722 * 0.9215 = 0.2355 for #3b82f6, worked by hand from the WCAG formula
  assert.equal(+lumFromRGB(59, 130, 246).toFixed(2), 23.55);
  for (let c = 0; c < 255; c++) {
    for (const f of [(x) => [x, 0, 0], (x) => [0, x, 0], (x) => [0, 0, x], (x) => [x, x, x]]) {
      assert.ok(lumFromRGB(...f(c + 1)) > lumFromRGB(...f(c)), `not rising at ${f(c + 1)}`);
    }
  }
});

test('RGBFromLum hits its target luminance within 0.5, with lightness in 0-100 and a valid hex', () => {
  let worst = 0;
  for (let lum = 0; lum <= 100; lum += 1) {
    for (let h = 0; h < 360; h += 15) {
      for (const s of [0, 50, 100]) {
        const l = lightnessFromHSLum(h, s, lum);
        assert.ok(l >= 0 && l <= 100, `lightness ${l} for lum ${lum}, h ${h}, s ${s}`);
        const { r, g, b } = RGBFromLum(lum, h, s);
        assert.match(RGBToHex(r, g, b), /^#[0-9a-f]{6}$/);
        worst = Math.max(worst, Math.abs(lumFromRGB(r, g, b) - lum));
      }
    }
  }
  assert.ok(worst <= 0.5, `worst luminance error ${worst}`);
});

test('closestLum returns { index: lum } for the nearest, and a tie goes to the higher index', () => {
  assert.deepEqual(closestLum([93.9, 61.1, 18.0, 4.7], 20), { 2: 18.0 });
  assert.deepEqual(closestLum([10, 20, 30], 25), { 2: 30 });
  assert.deepEqual(closestLum([50], 49.5), { 0: 50 });
});
