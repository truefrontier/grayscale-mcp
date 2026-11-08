// Calls every tool through an in-memory MCP client: real schema validation, real handlers, no network.
// Run with `npm test` (builds dist/ first).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, REMOTE_URL } from '../dist/server.js';

const TOOLS = ['generate_palette', 'export_palette', 'luminance_scale', 'color_info', 'adjust_shade', 'suggest_colors', 'false_color'];
const DEFAULT_LUMS = [93.87, 82.28, 68.67, 49.1, 40.2, 32.78, 13.29, 9.31, 6.3, 2.62, 1.3, 0.52];
const LABELS_12 = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '1000', '1100'];
const BLUE_URL = 'https://grayscale.design/app?lums=93.87,82.28,68.67,49.10,40.20,32.78,13.29,9.31,6.30,2.62,1.30,0.52&palettes=%233b82f6&filters=0%7C0&names=&labels=';
const BLUE_HEXES = ['#f5f8ff', '#dfebfe', '#c4dafc', '#95bcfa', '#7babf9', '#619bf8', '#0a5de1', '#094ebf', '#07419e', '#052a65', '#031c45', '#021026'];
const BLUE_SUGGESTIONS = [
  { role: 'analogous -60', hex: '#09c27b' },
  { role: 'triadic -120', hex: '#50c109' },
  { role: 'complementary', hex: '#ed960b' },
  { role: 'triadic +120', hex: '#f985b1' },
  { role: 'analogous +60', hex: '#d18ffa' },
];

let client;
before(async () => {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer().connect(serverSide);
  client = new Client({ name: 'grayscale-test', version: '0.0.0' });
  await client.connect(clientSide);
});
after(() => client.close());

async function call(name, args) {
  const r = await client.callTool({ name, arguments: args });
  return { isError: !!r.isError, text: r.content[0].text };
}
async function text(name, args) {
  const r = await call(name, args);
  assert.equal(r.isError, false, r.text);
  return r.text;
}
const json = async (name, args) => JSON.parse(await text(name, args));
async function error(name, args) {
  const r = await call(name, args);
  assert.equal(r.isError, true, `expected an error, got: ${r.text.slice(0, 200)}`);
  return r.text;
}
// The tailwind export is a comment line plus `const grayscale = {...}`.
const tailwindObject = (t) => JSON.parse(t.slice(t.indexOf('{')));

test('lists the seven tools, all read-only and closed-world', async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name), TOOLS);
  for (const t of tools) assert.deepEqual(t.annotations, { readOnlyHint: true, idempotentHint: true, openWorldHint: false }, t.name);
});

test('server version matches package.json', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(client.getServerVersion().version, pkg.version);
});

const SERVER_JSON = new URL('../server.json', import.meta.url);
test('server.json matches package.json and the remote endpoint', { skip: !existsSync(SERVER_JSON) && 'no server.json in this checkout' }, () => {
  const sj = JSON.parse(readFileSync(SERVER_JSON, 'utf8'));
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(sj.version, pkg.version);
  assert.deepEqual(sj.remotes, [{ type: 'streamable-http', url: REMOTE_URL }]);
  assert.equal(sj.repository.url, `https://github.com/${pkg.repository.replace('github:', '')}`);
  assert.ok(sj.description.length <= 100, 'the MCP registry caps description at 100 characters');
});

test('README tools table, formats and presets match the live schemas', async () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const rows = readme.split('\n').filter((l) => /^\| `\w+` \|/.test(l));
  assert.deepEqual(rows.map((l) => l.match(/^\| `(\w+)`/)[1]), TOOLS);

  const { tools } = await client.listTools();
  const schema = (name) => tools.find((t) => t.name === name).inputSchema.properties;
  const ticks = (row) => [...row.split('|')[2].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  const exportRow = ticks(rows.find((l) => l.startsWith('| `export_palette`')));
  for (const f of schema('export_palette').format.enum) assert.ok(exportRow.includes(f), `README export_palette row is missing format ${f}`);
  for (const c of schema('export_palette').color_type.enum) assert.ok(exportRow.includes(c), `README export_palette row is missing color_type ${c}`);
  const scaleRow = ticks(rows.find((l) => l.startsWith('| `luminance_scale`')));
  assert.deepEqual([...scaleRow].sort(), [...schema('luminance_scale').preset.enum].sort());
});

test('color_info: hex, rgb, hsl, oklch, luminance, name and contrast', async () => {
  assert.deepEqual(await json('color_info', { color: '#3b82f6', against: '#ffffff' }), {
    hex: '#3b82f6',
    rgb: [59, 130, 246],
    hsl: [217, 91.2, 59.8],
    oklch: [0.6231, 0.188, 259.81],
    lum: 23.55,
    name: 'blue',
    contrast_vs_white: 3.68,
    contrast_vs_black: 5.71,
    against: { hex: '#ffffff', lum: 100, contrast: 3.68 },
  });
});

test('color_info parses every input form the site accepts', async () => {
  const cases = {
    '3b82f6': '#3b82f6',
    '#38f': '#3388ff',
    'rgb(59, 130, 246)': '#3b82f6',
    '59 130 246': '#3b82f6',
    'RGBA(59, 130, 246, 0.5)': '#3b82f6', // alpha is ignored
    'rgb(59 130 246 / 50%)': '#3b82f6',
    'rgb(255, 255, 255)': '#ffffff',
    'hsl(217, 91%, 60%)': '#3c83f6',
    '217 91% 60%': '#3c83f6', // a % with no keyword means HSL
    'hsl(217.5, 91%, 60%)': '#3c82f6', // decimals are read whole, not from the last digit
    'hsl(360, 100%, 50%)': '#ff0000', // 360 is red, the same as 0
  };
  for (const [input, hex] of Object.entries(cases)) assert.equal((await json('color_info', { color: input })).hex, hex, input);
});

test('color_info refuses out-of-range values instead of clamping or misreading them', async () => {
  const bad = [
    'hsl(400, 150%, 70%)', 'hsl(361, 50%, 50%)', 'hsl(-10, 50%, 50%)', 'hsl(200, 101%, 50%)', 'hsl(200, 50%, 101%)', 'hsl(200, -1%, 50%)',
    'rgb(300, 130, 246)', 'rgb(256, 0, 0)', 'rgb(0, 0, -1)', 'rgb(100%, 0%, 0%)',
  ];
  for (const color of bad) assert.ok((await error('color_info', { color })).startsWith(`Could not read "${color}" as a color.`), color);
});

test('color_info rejects text that is not a color', async () => {
  for (const bad of ['not a color at all', '', '#12', '#12345', 'rgb(1, 2)', 'rgb(1, -2, 3)', 'my color is 59 130 246', '59 130 246 or so', 'rgb(59, 130, 246', '59, 130, 246)', 'cafebabe!']) {
    assert.equal(
      await error('color_info', { color: bad }),
      `Could not read "${bad}" as a color. Use hex (#3b82f6, 3b82f6, #38f), rgb(59, 130, 246) or hsl(217, 91%, 60%).`,
    );
  }
  assert.match(await error('color_info', { color: '#3b82f6', against: 'nope' }), /^Could not read "nope" as a color/);
});

test('generate_palette with no input returns only the default grayscale scale', async () => {
  const out = await json('generate_palette', {});
  assert.deepEqual(Object.keys(out), ['share_url', 'shade_labels', 'luminance_targets', 'palettes']);
  assert.deepEqual(out.shade_labels, LABELS_12);
  assert.deepEqual(out.luminance_targets, DEFAULT_LUMS);
  assert.deepEqual(Object.keys(out.palettes), ['grayscale']);
  assert.equal(out.palettes.grayscale.swatches[0].hex, '#f8f8f8');
  assert.equal(out.palettes.grayscale.swatches[11].hex, '#101010');
});

test('generate_palette builds one auto-named palette per color, plus suggestions and a share link', async () => {
  const out = await json('generate_palette', { colors: [{ color: '#3b82f6' }] });
  assert.equal(out.share_url, BLUE_URL);
  assert.deepEqual(Object.keys(out.palettes), ['grayscale', 'blue']);
  const blue = out.palettes.blue;
  assert.equal(blue.base, '#3b82f6');
  assert.equal(blue.hue_shift, 0);
  assert.equal(blue.sat_shift, 0);
  assert.deepEqual(blue.swatches.map((s) => s.hex), BLUE_HEXES);
  assert.deepEqual(blue.swatches[5], { label: '500', hex: '#619bf8', rgb: [97, 155, 248], hsl: [217, 91.2, 67.69], oklch: [0.6919, 0.1505, 259.44], lum: 32.76 });
  assert.deepEqual(out.suggested_colors, BLUE_SUGGESTIONS);
});

test('generate_palette reads its own share link back to the same palette', async () => {
  const fromColors = await json('generate_palette', { colors: [{ color: '#3b82f6' }] });
  const fromUrl = await json('generate_palette', { share_url: BLUE_URL });
  assert.deepEqual(fromUrl, fromColors);
});

test('generate_palette keeps the site quirk that shifts names onto earlier unnamed palettes', async () => {
  const out = await json('generate_palette', { share_url: 'https://grayscale.design/app?palettes=%23ef4444,%233b82f6&names=,primary' });
  assert.deepEqual(Object.keys(out.palettes), ['grayscale', 'primary', 'blue']);
  assert.equal(out.palettes.primary.base, '#ef4444');
});

test('generate_palette renames a palette called "grayscale" to "grayscale-alt"', async () => {
  const out = await json('generate_palette', { colors: [{ color: '#3b82f6', name: 'grayscale' }] });
  assert.deepEqual(Object.keys(out.palettes), ['grayscale', 'grayscale-alt']);
});

test('generate_palette applies the hue and saturation tweak per shade away from the base', async () => {
  const out = await json('generate_palette', { colors: [{ color: '#3b82f6', name: 'p', hue_shift: 10, sat_shift: -5 }] });
  const p = out.palettes.p;
  assert.equal(p.hue_shift, 10);
  assert.equal(p.sat_shift, -5);
  assert.ok(out.share_url.includes('&filters=10%7C-5&'), out.share_url);
  // #3b82f6 sits closest to shade 500 (index 5), so index 0 is 5 steps away.
  assert.deepEqual(p.swatches[5].hsl.slice(0, 2), [217, 91.2]);
  assert.deepEqual(p.swatches[0].hsl.slice(0, 2), [267, 66.2]);
});

test('two colors with the same palette name are an error, not a silently dropped palette', async () => {
  const msg = 'Each palette needs its own name, but 2 colors produced only: blue. Pass a distinct name for each color.';
  assert.equal(await error('generate_palette', { colors: [{ color: '#3b82f6' }, { color: '#2563eb' }] }), msg);
  assert.equal(await error('export_palette', { colors: [{ color: '#3b82f6' }, { color: '#2563eb' }], format: 'css-vars' }), msg);
  assert.equal(await error('generate_palette', { share_url: 'https://grayscale.design/app?palettes=%233b82f6,%232563eb' }), msg);
  assert.match(await error('generate_palette', { colors: [{ color: '#3b82f6', name: 'brand' }, { color: '#ef4444', name: 'brand' }] }), /produced only: brand\./);
  // Integer-like names sort before "grayscale" in object key order.
  assert.match(await error('generate_palette', { colors: [{ color: '#3b82f6', name: '500' }, { color: '#ef4444', name: '500' }] }), /produced only: 500\./);
  const named = await json('generate_palette', { colors: [{ color: '#3b82f6', name: 'primary' }, { color: '#2563eb', name: 'accent' }] });
  assert.deepEqual(Object.keys(named.palettes), ['grayscale', 'primary', 'accent']);
});

test('lock snaps the nearest grayscale shade to the color and adds a Tailwind DEFAULT key', async () => {
  const t = await text('export_palette', { colors: [{ color: '#3b82f6', lock: true }], format: 'tailwind', color_type: 'hex' });
  assert.ok(t.includes('lums=93.87,82.28,68.67,49.10,40.20,23.55,'), 'shade 500 takes the color luminance 23.55');
  const blue = tailwindObject(t).blue;
  assert.equal(blue['500'], '#3b82f6');
  assert.equal(blue.DEFAULT, '#3b82f6');
});

test('uppercase hex is read as lowercase, so a locked color still gets its DEFAULT key', async () => {
  assert.equal((await json('color_info', { color: ' #3B82F6 ' })).hex, '#3b82f6');
  const t = await text('export_palette', { colors: [{ color: '#3B82F6', lock: true }], format: 'tailwind', color_type: 'hex' });
  assert.equal(tailwindObject(t).blue.DEFAULT, '#3b82f6');
  assert.ok(t.includes('&palettes=%233b82f6&'), 'share link carries the lowercase hex');
});

test('share_url is held to the same limits as typed input', async () => {
  const link = (q) => `https://grayscale.design/app?${q}`;
  assert.match(await error('generate_palette', { share_url: link('palettes=zzzzzz') }), /^Could not read "zzzzzz" as a color/);
  for (const lums of ['abc,50,10', '50', '90,50,10,' + '5,'.repeat(18), '90,50,150']) {
    assert.equal(await error('export_palette', { share_url: link(`lums=${lums}`), format: 'json' }), 'share_url lums must be 3-20 numbers from 0 to 100.', lums);
  }
  // filters are hue|sat per palette, with the same ranges as hue_shift and sat_shift.
  for (const filters of ['51%7C0', '-51%7C0', '0%7C31', '0%7C-31', 'Infinity%7C0']) {
    assert.equal(
      await error('generate_palette', { share_url: link(`palettes=%233b82f6&filters=${filters}`) }),
      'share_url filters must be hue|sat pairs, hue from -50 to 50 and sat from -30 to 30.',
      filters,
    );
  }
  const edge = Object.values((await json('generate_palette', { share_url: link('palettes=%233b82f6&filters=-50%7C30') })).palettes)[1];
  assert.deepEqual([edge.hue_shift, edge.sat_shift], [-50, 30]);
  // At most 30 palettes, the same cap as colors.
  const hexes = (n) => Array.from({ length: n }, (_, i) => `%23${(i * 8).toString(16).padStart(2, '0')}0000`).join(',');
  const names = (n) => Array.from({ length: n }, (_, i) => `c${i}`).join(',');
  assert.equal(await error('generate_palette', { share_url: link(`palettes=${hexes(31)}&names=${names(31)}`) }), 'share_url can hold at most 30 palettes.');
  assert.equal(Object.keys((await json('generate_palette', { share_url: link(`palettes=${hexes(30)}&names=${names(30)}`) })).palettes).length, 31);
  // Hex without "#" or in 3-digit form is normalized the way typed input is.
  const out = await json('generate_palette', { share_url: link('palettes=3B82F6,%23f00') });
  assert.deepEqual(Object.values(out.palettes).slice(1).map((p) => p.base), ['#3b82f6', '#ff0000']);
});

test('locking two colors onto the same shade is an error', async () => {
  assert.equal(
    await error('generate_palette', { colors: [{ color: '#3b82f6', lock: true }, { color: '#3b82f7', lock: true }] }),
    '#3b82f7: this color value is already LOCKED (shade index 5)',
  );
});

test('export_palette: every format starts with its own header', async () => {
  const colors = [{ color: '#3b82f6', name: 'primary' }];
  const url = BLUE_URL.replace('names=', 'names=primary');
  const expected = {
    tailwind: `// Grayscale Design palette: ${url}\nconst grayscale = {`,
    radix: `// Grayscale Design palette: ${url}\n\nconst grayscale = {\n  'grayscale1': 'rgb(248, 248, 248)',`,
    'css-vars': `/* Grayscale Design palette: ${url} */\n:root {\n  --grayscale-50: rgb(248, 248, 248);`,
    scss: `// Grayscale Design palette: ${url}\n$grayscale-50: rgb(248, 248, 248);`,
    less: `// Grayscale Design palette: ${url}\n@grayscale-50: rgb(248, 248, 248);`,
    stylus: `// Grayscale Design palette: ${url}\ngrayscale-100 = rgb(248, 248, 248)`,
    'auto-dark-css': `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n@layer utilities {\n  /* Grayscale Design palette: ${url} */`,
    'auto-dark-tailwind': 'function setAsCssVariable(colorName) {\n  let augmentedPalette = {};\n  const values = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100];',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="820" height="380" viewBox="0 0 820 380">',
  };
  for (const [format, start] of Object.entries(expected)) {
    const t = await text('export_palette', { colors, format });
    assert.ok(t.startsWith(start), `${format} starts with:\n${t.slice(0, start.length + 40)}`);
  }
});

test('export_palette: format bodies', async () => {
  const colors = [{ color: '#3b82f6', name: 'primary' }];
  const get = (format) => text('export_palette', { colors, format });
  assert.deepEqual(Object.keys(tailwindObject(await get('tailwind'))), ['grayscale', 'primary']);
  assert.deepEqual(Object.keys(JSON.parse(await get('json'))), ['grayscale', 'primary']);
  const radix = await get('radix');
  assert.ok(radix.includes("\nconst primaryDark = {\n  'primary1': "), 'radix has a dark scale');
  assert.ok(radix.includes("  'primary12': "), 'radix numbers steps 1-12');
  const dark = await get('auto-dark-css');
  assert.ok(dark.includes('    --primary-50: 245 248 255;\n'), 'light values are bare rgb channels');
  assert.ok(dark.includes('      --neutral-50: var(--grayscale-1100);\n'), 'dark mode flips neutral');
  assert.ok(dark.includes('      --primary-50: var(--primary-1100);\n'), 'dark mode flips each palette');
  assert.ok((await get('auto-dark-tailwind')).includes("      primary: setAsCssVariable('primary'),\n      neutral: setAsCssVariable('neutral'),\n"));
  const svg = await get('svg');
  assert.ok(svg.includes('<rect id="primary-100" x="50" y="230" width="60" height="60" style="fill: #f5f8ff" />'));
  assert.ok(svg.endsWith('</svg>'));
});

test('export_palette: color_type picks the notation, rgb by default', async () => {
  const line = async (color_type) => {
    const t = await text('export_palette', { colors: [{ color: '#3b82f6', name: 'primary' }], format: 'css-vars', color_type });
    return t.split('\n').find((l) => l.includes('--primary-500:')).trim();
  };
  assert.equal(await line(undefined), '--primary-500: rgb(97, 155, 248);');
  assert.equal(await line('hex'), '--primary-500: #619bf8;');
  assert.equal(await line('hsl'), '--primary-500: hsl(217, 91.20%, 67.69%);');
  assert.equal(await line('oklch'), '--primary-500: oklch(0.6919 0.1505 259.44);');
});

test('export_palette keeps the documented site quirks (Stylus labels, Radix + OKLCH)', async () => {
  const colors = [{ color: '#3b82f6', name: 'primary' }];
  const stylus = await text('export_palette', { colors, format: 'stylus' });
  const labels = stylus.split('\n').filter((l) => l.startsWith('primary-')).map((l) => l.split(' ')[0].replace('primary-', ''));
  assert.deepEqual(labels, ['100', '200', '300', '400', '500', '600', '700', '800', '900', '1000', '1100', '1200']);
  const radixOklch = await text('export_palette', { colors, format: 'radix', color_type: 'oklch' });
  assert.equal(radixOklch, `// Grayscale Design palette: ${BLUE_URL.replace('names=', 'names=primary')}\n`);
});

test('luminance_scale: presets, resizing and custom targets', async () => {
  const scale = async (args) => (await json('luminance_scale', args)).shades.map((s) => [s.label, s.lum]);
  const tw = await json('luminance_scale', { preset: 'tailwind' });
  assert.deepEqual(tw.shades.map((s) => s.label), ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']);
  assert.equal(tw.url_lums, '93.88,87.19,75.61,61.14,42.57,28.39,18.04,11.21,6.97,4.72,1.63');
  assert.deepEqual(tw.presets, { bell: 'Bell Curve', linear: 'Linear', dark: 'Darker Side', light: 'Lighter Side', default: 'Default', tailwind: 'Tailwind', radix: 'Radix' });
  // Fewer than 10 shades are labelled 100, 200, ...
  assert.deepEqual(await scale({ count: 5 }), [['100', 93.87], ['200', 82.28], ['300', 68.67], ['400', 49.1], ['500', 40.2]]);
  // The site's + button adds half of the last value.
  assert.deepEqual((await scale({ count: 14 })).slice(-3).map(([, l]) => l), [0.52, 0.26, 0.13]);
  assert.deepEqual(await scale({ preset: 'bell', count: 9 }), [['100', 93.87], ['200', 88.95], ['300', 80.74], ['400', 67.62], ['500', 47.2], ['600', 26.77], ['700', 13.65], ['800', 5.44], ['900', 0.52]]);
  assert.deepEqual(await scale({ preset: 'linear', lums: [80, 50, 20] }), [['100', 80], ['200', 50], ['300', 20]]);
  const first = (await json('luminance_scale', { lums: [90, 50, 10] })).shades[0];
  assert.deepEqual(first, { label: '100', lum: 90, rgb: [243, 243, 243], hex: '#f3f3f3' });
});

test('luminance_scale: the dark, light, linear and radix presets', async () => {
  const lums = async (preset, count) => (await json('luminance_scale', { preset, count })).shades.map((s) => s.lum);
  // dark/light/linear redistribute the default range (93.87..0.52); fixed presets ignore the current scale.
  assert.deepEqual(await lums('dark', 6), [93.87, 59.08, 36.03, 19.66, 8.25, 0.52]);
  assert.deepEqual(await lums('light', 6), [93.87, 86.14, 74.73, 58.36, 35.31, 0.52]);
  assert.deepEqual(await lums('linear', 6), [93.87, 75.2, 56.53, 37.86, 19.19, 0.52]);
  assert.deepEqual(await lums('radix'), [98.1, 96.4, 90.1, 83.3, 75.6, 65.8, 52.6, 37.4, 15.2, 12.8, 10.2, 1.2]);
  assert.deepEqual(await lums('radix', 6), [98.1, 96.4, 90.1, 83.3, 75.6, 65.8]);
});

test('svg prints swatch values with PHP rounding, like ExportController', async () => {
  const svg = await text('export_palette', { colors: [{ color: '#3b82f6', name: 'primary' }], format: 'svg' });
  const style = 'font-size: 5px;fill: #231f20;font-family: Courier, monospace';
  const at = (y, v) => `<text transform="translate(350 ${y})" style="${style}">${v}</text>`;
  // Index 5: the rect id counts from 1 (primary-600) while the label row says 500, as on the site.
  const swatch5 = '<rect id="primary-600" x="350" y="230" width="60" height="60" style="fill: #619bf8" />' +
    at(300, '#619bf8') + at(310, '97, 155, 248') + at(320, '217, 91.2%, 67.7%') + at(330, '32.76%') + at(340, '500');
  assert.ok(svg.includes(swatch5), 'swatch 500 text block');
  assert.ok(svg.includes('<image id="logo" width="322" height="63" transform="translate(692.66666666667 20) scale(0.33)" xlink:href="data:image/png;base64,'));
});

test('adjust_shade keeps hue and saturation and hits the target luminance', async () => {
  assert.deepEqual(await json('adjust_shade', { color: '#3b82f6', lum: 40.2 }), {
    input: '#3b82f6', target_lum: 40.2, hex: '#7babf9', rgb: [123, 171, 249], hsl: [217, 91.2, 73], actual_lum: 40.18,
  });
  assert.equal((await json('adjust_shade', { color: '#808080', lum: 100 })).hex, '#ffffff');
  assert.equal((await json('adjust_shade', { color: '#ff0000', lum: 0 })).hex, '#000000');
  assert.match(await error('adjust_shade', { color: 'blue-ish', lum: 50 }), /^Could not read "blue-ish" as a color/);
});

test('suggest_colors returns the five site suggestions, none for black', async () => {
  assert.deepEqual(await json('suggest_colors', { color: '#3b82f6' }), BLUE_SUGGESTIONS);
  assert.deepEqual(await json('suggest_colors', { color: '#000' }), []);
  assert.match(await error('suggest_colors', { color: 'xyz' }), /^Could not read "xyz" as a color/);
});

test('false_color: site defaults, explicit hue and saturation, and the luminance box', async () => {
  assert.deepEqual(await json('false_color', {}), {
    gray: { rgb: [200, 200, 200], hex: '#c8c8c8', lum: 57.76 },
    false_color: { rgb: [131, 214, 214], hex: '#83d6d6', hue: 180, sat: 50, lum: 57.77 },
  });
  assert.equal((await json('false_color', { gray: 128, hue: 0, sat: 100 })).false_color.hex, '#ff0d0d');
  // Like the site's luminance box, `lum` sets the gray to the red channel of a teal at that luminance,
  // so the gray's own luminance differs from the one passed in. `lum` wins over `gray`.
  const viaLum = await json('false_color', { lum: 50, gray: 10 });
  assert.deepEqual(viaLum.gray, { rgb: [100, 100, 100], hex: '#646464', lum: 12.74 });
});

test('schema validation rejects out-of-range input before any handler runs', async () => {
  const bad = [
    ['generate_palette', { count: 2 }],
    ['generate_palette', { count: 21 }],
    ['generate_palette', { count: 3.5 }],
    ['generate_palette', { lums: [90, 10] }],
    ['generate_palette', { lums: [90, 50, 101] }],
    ['generate_palette', { preset: 'pastel' }],
    ['generate_palette', { share_url: 'grayscale.design/app' }],
    ['generate_palette', { colors: [{ name: 'no color' }] }],
    ['generate_palette', { colors: [{ color: '#3b82f6', hue_shift: 51 }] }],
    ['generate_palette', { colors: [{ color: '#3b82f6', sat_shift: -31 }] }],
    ['generate_palette', { colors: Array.from({ length: 31 }, () => ({ color: '#3b82f6' })) }],
    ['export_palette', { colors: [{ color: '#3b82f6' }] }],
    ['export_palette', { format: 'pdf' }],
    ['export_palette', { format: 'tailwind', color_type: 'cmyk' }],
    ['luminance_scale', { count: 2 }],
    ['color_info', {}],
    ['color_info', { color: 3 }],
    ['adjust_shade', { color: '#3b82f6' }],
    ['adjust_shade', { color: '#3b82f6', lum: 101 }],
    ['suggest_colors', {}],
    ['false_color', { gray: 256 }],
    ['false_color', { gray: 1.5 }],
    ['false_color', { hue: 360 }],
    ['false_color', { sat: -1 }],
    ['false_color', { lum: 100.1 }],
  ];
  for (const [name, args] of bad) {
    assert.match(await error(name, args), new RegExp(`^MCP error -32602: Input validation error: Invalid arguments for tool ${name}: `), `${name} ${JSON.stringify(args)}`);
  }
});

test('an unknown tool is a tool error, not a crash', async () => {
  assert.equal(await error('make_coffee', {}), 'MCP error -32602: Tool make_coffee not found');
});
