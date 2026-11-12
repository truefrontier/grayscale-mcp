// The tools make promises in their descriptions: every shade has the grayscale shade's luminance, a
// share link opens the same palette, a locked color lands in its own palette, adjust_shade keeps
// hue and saturation. These tests check those promises on seeded random inputs, through the same
// in-memory MCP client as tools.test.mjs. The seed is fixed, so every run checks the same inputs;
// a failure message names the input that broke.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../dist/server.js';

const PRESETS = ['default', 'tailwind', 'radix', 'bell', 'linear', 'dark', 'light'];
const FORMATS = ['tailwind', 'radix', 'css-vars', 'scss', 'less', 'stylus', 'auto-dark-css', 'auto-dark-tailwind', 'svg', 'json'];
// Rounding each RGB channel to a whole number moves luminance (0-100) by up to about 0.45 near white.
const LUM_TOLERANCE = 0.5;

let client;
before(async () => {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer().connect(serverSide);
  client = new Client({ name: 'grayscale-invariants', version: '0.0.0' });
  await client.connect(clientSide);
});
after(() => client.close());

async function call(name, args) {
  const r = await client.callTool({ name, arguments: args });
  return { isError: !!r.isError, text: r.content[0].text };
}
async function json(name, args) {
  const r = await call(name, args);
  assert.equal(r.isError, false, `${name} ${JSON.stringify(args)}: ${r.text}`);
  return JSON.parse(r.text);
}

// mulberry32: a small seeded generator, so the "random" inputs are the same on every run.
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
const hex = (r) => '#' + [0, 1, 2].map(() => int(r, 0, 255).toString(16).padStart(2, '0')).join('');

// One to three colors, sometimes with a hue/sat tweak, plus a random preset and shade count.
// Named "c0", "c1"... so two colors can't land on the same auto name.
function paletteArgs(r, { lock = false } = {}) {
  const colors = Array.from({ length: int(r, 1, 3) }, (_, i) => ({
    color: hex(r),
    name: `c${i}`,
    ...(r() < 0.4 ? { hue_shift: int(r, -50, 50), sat_shift: int(r, -30, 30) } : {}),
  }));
  if (lock) colors[0].lock = true;
  const args = { colors };
  if (r() < 0.5) args.preset = PRESETS[int(r, 0, PRESETS.length - 1)];
  if (r() < 0.3) args.count = int(r, 3, 20);
  return args;
}

test('generate_palette: every shade is within 0.5 luminance of the grayscale shade with the same label', async () => {
  const r = rng(11);
  for (let i = 0; i < 60; i++) {
    const args = paletteArgs(r, { lock: r() < 0.2 });
    const out = await json('generate_palette', args);
    const gray = out.palettes.grayscale.swatches;
    assert.deepEqual(gray.map((s) => s.label), out.shade_labels);
    for (const [name, p] of Object.entries(out.palettes)) {
      assert.deepEqual(p.swatches.map((s) => s.label), out.shade_labels, `${JSON.stringify(args)} ${name}`);
      p.swatches.forEach((s, j) => {
        assert.ok(Math.abs(s.lum - gray[j].lum) <= LUM_TOLERANCE, `${JSON.stringify(args)} ${name} ${s.label}: ${s.lum} vs gray ${gray[j].lum}`);
      });
    }
  }
});

// Like the site, the locked shade is rebuilt from the color's rounded HSL, so it isn't always the exact color.
test('lock: the shade takes the color\'s luminance, and Tailwind gets DEFAULT exactly when the shade comes back unchanged', async () => {
  const r = rng(12);
  let exact = 0;
  for (let i = 0; i < 40; i++) {
    const args = paletteArgs(r, { lock: true });
    const base = args.colors[0].color;
    const at = JSON.stringify(args);
    const { lum } = await json('color_info', { color: base });
    const out = await json('generate_palette', args);
    const j = out.palettes.grayscale.swatches.findIndex((s) => s.lum === lum);
    assert.notEqual(j, -1, `${at}: no grayscale shade at ${lum}`);
    const shade = out.palettes.c0.swatches[j];
    assert.ok(Math.abs(shade.lum - lum) <= LUM_TOLERANCE, `${at}: ${shade.hex} at ${shade.lum}`);
    const tailwind = (await call('export_palette', { ...args, format: 'tailwind', color_type: 'hex' })).text;
    if (shade.hex === base) {
      exact++;
      assert.ok(tailwind.includes(`"DEFAULT": "${base}"`), `${at}: exact, but no DEFAULT`);
    } else {
      assert.ok(!tailwind.includes('DEFAULT'), `${at}: ${shade.hex}, but DEFAULT anyway`);
    }
  }
  assert.ok(exact >= 20, `only ${exact} of 40 locked colors came back exact`);
});

test('lock keeps the site quirk: #06fcff comes back as #2dfbff, so the Tailwind export has no DEFAULT', async () => {
  const colors = [{ color: '#06fcff', name: 'cyan', lock: true }];
  const out = await json('generate_palette', { colors });
  assert.equal(out.luminance_targets[1], 76.88);
  const { label, hex: got, rgb, hsl, lum } = out.palettes.cyan.swatches[1];
  assert.deepEqual({ label, hex: got, rgb, hsl, lum }, { label: '100', hex: '#2dfbff', rgb: [45, 251, 255], hsl: [181, 100, 58.82], lum: 76.77 });
  assert.ok(!(await call('export_palette', { colors, format: 'tailwind', color_type: 'hex' })).text.includes('DEFAULT'));
});

test('generate_palette: the share link reads back to the same palettes, each channel within 2', async () => {
  // The link stores luminance targets to 2 decimals, as the site's does, so a shade can move by a unit or two.
  const r = rng(13);
  let exact = 0;
  for (let i = 0; i < 40; i++) {
    const args = paletteArgs(r, { lock: r() < 0.2 });
    if (r() < 0.5) for (const c of args.colors) delete c.name; // all auto-named: the names quirk needs a mix
    const first = await call('generate_palette', args);
    if (first.isError && /own name/.test(first.text)) continue; // two colors got the same auto name
    const a = JSON.parse(first.text);
    const b = await json('generate_palette', { share_url: a.share_url });
    const at = JSON.stringify(args);
    assert.equal(b.share_url, a.share_url, at);
    assert.deepEqual(b.shade_labels, a.shade_labels, at);
    assert.deepEqual(Object.keys(b.palettes), Object.keys(a.palettes), at);
    let same = true;
    for (const [name, p] of Object.entries(a.palettes)) {
      p.swatches.forEach((s, j) => {
        const t = b.palettes[name].swatches[j];
        const d = Math.max(...s.rgb.map((v, k) => Math.abs(v - t.rgb[k])));
        assert.ok(d <= 2, `${at} ${name} ${s.label}: ${s.hex} became ${t.hex}`);
        if (d) same = false;
      });
    }
    if (same) exact++;
  }
  assert.ok(exact >= 20, `only ${exact} of 40 links read back exactly`);
});

test('color_info reads its own hex, rgb() and hsl() output back to the same color', async () => {
  const r = rng(14);
  for (let i = 0; i < 150; i++) {
    const h = hex(r);
    const a = await json('color_info', { color: h });
    assert.equal(a.hex, h);
    assert.equal((await json('color_info', { color: h.slice(1).toUpperCase() })).hex, h);
    assert.equal((await json('color_info', { color: `rgb(${a.rgb.join(', ')})` })).hex, h);
    // HSL is rounded to a whole hue and one decimal, which can move a channel by up to 2.
    const back = await json('color_info', { color: `hsl(${a.hsl[0]}, ${a.hsl[1]}%, ${a.hsl[2]}%)` });
    assert.ok(back.rgb.every((v, k) => Math.abs(v - a.rgb[k]) <= 2), `${h} -> hsl(${a.hsl}) -> ${back.hex}`);
  }
});

test('color_info: contrast is the same both ways, from 1 to 21, and 1 against itself', async () => {
  const r = rng(15);
  assert.equal((await json('color_info', { color: '#000000', against: '#ffffff' })).against.contrast, 21);
  for (let i = 0; i < 150; i++) {
    const [x, y] = [hex(r), hex(r)];
    const xy = await json('color_info', { color: x, against: y });
    const yx = await json('color_info', { color: y, against: x });
    assert.equal(xy.against.contrast, yx.against.contrast, `${x} ${y}`);
    for (const c of [xy.against.contrast, xy.contrast_vs_white, xy.contrast_vs_black]) assert.ok(c >= 1 && c <= 21, `${x} ${y}: ${c}`);
    assert.equal((await json('color_info', { color: x, against: x })).against.contrast, 1, x);
  }
});

test('adjust_shade keeps the hue and saturation and lands within 0.5 of the target luminance', async () => {
  const r = rng(16);
  for (let i = 0; i < 150; i++) {
    const color = hex(r);
    const lum = int(r, 0, 10000) / 100;
    const info = await json('color_info', { color });
    const out = await json('adjust_shade', { color, lum });
    const at = `${color} -> ${lum}: ${out.hex} at ${out.actual_lum}`;
    assert.deepEqual(out.hsl.slice(0, 2), info.hsl.slice(0, 2), at);
    assert.ok(Math.abs(out.actual_lum - lum) <= LUM_TOLERANCE, at);
    assert.equal((await json('color_info', { color: out.hex })).lum, out.actual_lum, at);
  }
});

test('false_color returns a color with the gray\'s luminance, within 0.5', async () => {
  const r = rng(17);
  for (let i = 0; i < 150; i++) {
    const args = r() < 0.5 ? { gray: int(r, 0, 255) } : { lum: int(r, 0, 10000) / 100 };
    Object.assign(args, { hue: int(r, 0, 359), sat: int(r, 0, 100) });
    const out = await json('false_color', args);
    assert.ok(Math.abs(out.false_color.lum - out.gray.lum) <= LUM_TOLERANCE, `${JSON.stringify(args)}: ${out.false_color.lum} vs ${out.gray.lum}`);
  }
});

test('export_palette: every format names every palette and writes no NaN, undefined, null or Infinity', async () => {
  const r = rng(18);
  const NAMES = ['primary', 'brand-blue', 'brand_green', 'Accent', 'class', 'new', 'default', 'x'];
  for (let i = 0; i < 12; i++) {
    const colors = Array.from({ length: int(r, 1, 3) }, (_, k) => ({ color: hex(r), name: `${NAMES[int(r, 0, NAMES.length - 1)]}${k}` }));
    for (const format of FORMATS) {
      const color_type = ['rgb', 'hex', 'hsl', 'oklch'][int(r, 0, 3)];
      const at = `${format} ${color_type} ${JSON.stringify(colors)}`;
      const out = await call('export_palette', { colors, format, color_type });
      assert.equal(out.isError, false, `${at}: ${out.text}`);
      for (const c of colors) assert.ok(out.text.includes(c.name), `${at}: no ${c.name}`);
      if (format === 'json') JSON.parse(out.text);
      else assert.doesNotMatch(out.text, /\b(NaN|undefined|null|Infinity)\b/, at);
    }
  }
});

test('luminance_scale: every preset and count gives that many gray shades, lightest first', async () => {
  for (const preset of PRESETS) {
    for (const count of [3, 4, 7, 11, 12, 13, 20]) {
      const { shades, url_lums } = await json('luminance_scale', { preset, count });
      const at = `${preset} x ${count}`;
      assert.equal(shades.length, count, at);
      assert.equal(url_lums.split(',').length, count, at);
      for (let k = 1; k < count; k++) assert.ok(shades[k].lum <= shades[k - 1].lum, `${at} shade ${k}`);
      for (const s of shades) assert.ok(s.rgb[0] === s.rgb[1] && s.rgb[1] === s.rgb[2], `${at} ${s.label} is not gray`);
    }
  }
});
