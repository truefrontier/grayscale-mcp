// colorName(h, s, l) against docs/colorName-spec.md, written from the spec alone.
// Run after `npm run build`: imports the compiled dist/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colorName } from '../dist/site/color.js';

const WORDS = ['black', 'white', 'gray', 'red', 'orange', 'yellow', 'brown', 'green', 'teal', 'blue', 'purple', 'pink'];
const E = 0.001; // the spec checks every boundary at 0.001 resolution

// Each boundary from "## Boundaries": [label, h, s, l at the bound, expected, the same just below, expected].
// The other two inputs are held where only the bound under test decides the name.
const BOUNDARIES = [
  // saturation
  ['s=1 (nearly neutral pastel)', [200, 1, 80], 'blue', [200, 1 - E, 80], 'gray'],
  ['s=11 (low saturation, mid lightness)', [200, 11, 50], 'blue', [200, 11 - E, 50], 'gray'],
  ['s=11 (dark)', [200, 11, 10], 'black', [200, 11 - E, 10], 'gray'],
  ['s=11 (light: s >= 11 with l >= 90 gets its hue)', [200, 11, 95], 'blue', [200, 11 - E, 95], 'white'],
  ['s=90 (warm band, h < 36)', [20, 90, 50], 'orange', [20, 90 - E, 50], 'brown'],
  ['s=90 (warm band, h >= 36)', [40, 90, 50], 'yellow', [40, 90 - E, 50], 'brown'],
  // lightness
  ['l=16 (dark)', [200, 50, 16], 'blue', [200, 50, 16 - E], 'black'],
  ['l=71 (low saturation)', [200, 5, 71], 'blue', [200, 5, 71 - E], 'gray'],
  ['l=90 (low saturation)', [200, 5, 90], 'white', [200, 5, 90 - E], 'blue'],
  // hue bands
  ['h=0', [0, 50, 50], 'red', [-E, 50, 50], undefined],
  ['h=16', [16, 50, 50], 'brown', [16 - E, 50, 50], 'red'],
  ['h=36 (s >= 90)', [36, 95, 50], 'yellow', [36 - E, 95, 50], 'orange'],
  ['h=55', [55, 50, 50], 'green', [55 - E, 50, 50], 'brown'],
  ['h=156', [156, 50, 50], 'teal', [156 - E, 50, 50], 'green'],
  ['h=191', [191, 50, 50], 'blue', [191 - E, 50, 50], 'teal'],
  ['h=261', [261, 50, 50], 'purple', [261 - E, 50, 50], 'blue'],
  ['h=291', [291, 50, 50], 'pink', [291 - E, 50, 50], 'purple'],
  ['h=346', [346, 50, 50], 'red', [346 - E, 50, 50], 'pink'],
];

for (const [label, at, atName, below, belowName] of BOUNDARIES) {
  test(`boundary ${label}: lower bound is inclusive`, () => {
    assert.equal(colorName(...at), atName, `colorName(${at}) at the bound`);
    assert.equal(colorName(...below), belowName, `colorName(${below}) just below`);
  });
}

// "The first rule that applies wins", and the edge rules. [label, [h, s, l], expected].
const RULES = [
  ['rule 1 before the nearly-neutral check: s < 1 and l >= 90 is white', [200, 0.5, 95], 'white'],
  ['rule 1: s < 1 with 71 <= l < 90 is gray', [200, 0.5, 80], 'gray'],
  ['rule 1: s = 0 is gray', [200, 0, 80], 'gray'],
  ['rule 1 before rule 2: s < 11 and l < 16 is gray, not black', [200, 5, 10], 'gray'],
  ['h = 360 is red', [360, 50, 50], 'red'],
  ['any h above 360 is red', [361, 50, 50], 'red'],
  ['any h above 360 is red (720)', [720, 50, 50], 'red'],
  ['warm band: s < 90 is brown at h = 54', [54, 89, 50], 'brown'],
  ['hue below 0 in a chromatic branch is undefined', [-10, 50, 50], undefined],
  ['NaN hue in a chromatic branch is undefined', [NaN, 50, 50], undefined],
  ['NaN hue never reaches the hue step when rule 1 names it (white)', [NaN, 5, 95], 'white'],
  ['negative s with 71 <= l < 90 gets its hue', [200, -5, 80], 'blue'],
  ['NaN l with s >= 1 in the low-saturation branch gets its hue', [200, 5, NaN], 'blue'],
  ['NaN l with s < 1 is gray (nearly neutral)', [200, 0.5, NaN], 'gray'],
  ['NaN l never satisfies the dark test', [200, 50, NaN], 'blue'],
  ['undefined l never satisfies the dark test', [200, 50, undefined], 'blue'],
  ['undefined s never satisfies the low-saturation test', [200, undefined, 50], 'blue'],
  ['NaN s never satisfies the low-saturation test', [200, NaN, 95], 'blue'],
  ['null h behaves like 0 (red)', [null, 50, 50], 'red'],
  ['numeric strings behave like numbers', ['200', '50', '50'], 'blue'],
  ['numeric strings behave like numbers at a bound', ['16', '50', '50'], 'brown'],
  ['numeric strings behave like numbers in rule 1', ['200', '5', '95'], 'white'],
];

for (const [label, args, expected] of RULES) {
  test(label, () => assert.equal(colorName(...args), expected, `colorName(${args.map(String)})`));
}

// Spec line 48 vs color.js: the spec says an undefined or NaN s never satisfies the dark test
// (rule 2 needs s >= 11), so a dark color with no saturation still gets its hue. color.js only
// checks l < 16 once s < 11 has failed, so it says black. Outside the app's real input domain;
// reported in the PR, not fixed here (color.js is vendored).
const SPEC_VS_CODE = 'spec and color.js disagree; see the PR';
test('undefined s never satisfies the dark test', { todo: SPEC_VS_CODE }, () => {
  assert.equal(colorName(200, undefined, 10), 'blue');
});
test('NaN s never satisfies the dark test', { todo: SPEC_VS_CODE }, () => {
  assert.equal(colorName(200, NaN, 10), 'blue');
});

// The spec, transcribed, for the whole real input domain: integer h 0..360, s and l on a whole-number
// grid plus each side of every boundary. Catches anything the boundary rows miss inside a band.
function specName(h, s, l) {
  if (s < 11) {
    if (l >= 90) return 'white';
    if (l < 71) return 'gray';
    if (s >= 0 && s < 1) return 'gray';
  } else if (l < 16) return 'black';
  if (h < 0 || Number.isNaN(h)) return undefined;
  if (h >= 346) return 'red';
  if (h >= 291) return 'pink';
  if (h >= 261) return 'purple';
  if (h >= 191) return 'blue';
  if (h >= 156) return 'teal';
  if (h >= 55) return 'green';
  if (h >= 16) return s < 90 ? 'brown' : h < 36 ? 'orange' : 'yellow';
  return 'red';
}

test('every input in the real domain matches the spec and names one of the 12 words', () => {
  const grid = (bounds) => [...new Set([...Array(101).keys(), ...bounds.flatMap((b) => [b - E, b])])];
  const ss = grid([1, 11, 90]);
  const ls = grid([16, 71, 90]);
  let checked = 0;
  for (let h = 0; h <= 360; h++) {
    for (const s of ss) {
      for (const l of ls) {
        const got = colorName(h, s, l);
        if (got !== specName(h, s, l) || !WORDS.includes(got)) {
          assert.fail(`colorName(${h}, ${s}, ${l}) = ${got}, spec says ${specName(h, s, l)}`);
        }
        checked++;
      }
    }
  }
  assert.equal(checked, 361 * ss.length * ls.length);
});
