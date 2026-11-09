// Hostile input through the real tools: what a crafted share link or argument can put into
// generated code, and what it can do to the HTTP server. Run with `npm test` (builds dist/ first).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../dist/server.js';
import { FORMATS, exportText } from '../dist/exports.js';
import { buildColors } from '../dist/palette.js';

const LUMS = '93.88,87.19,75.61,61.14,42.57,28.39,18.04,11.21,6.97,4.72,1.63';
const shareLink = (names) => `https://grayscale.design/app?lums=${LUMS}&palettes=%23ef4444&filters=0%7C0&names=${encodeURIComponent(names)}&labels=`;
const PAYLOAD = "x};require('child_process').execSync('id');({";

let client;
before(async () => {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer().connect(serverSide);
  client = new Client({ name: 'grayscale-security-test', version: '0.0.0' });
  await client.connect(clientSide);
});
after(() => client.close());

async function call(name, args) {
  const r = await client.callTool({ name, arguments: args });
  return { isError: !!r.isError, text: r.content[0].text };
}

test('a share-link name that is not a plain name falls back to the auto name in every format', async () => {
  for (const names of [PAYLOAD, '<script>alert(1)</script>', 'a b', '__proto__', '1abc', 'x'.repeat(33)]) {
    for (const format of FORMATS) {
      const r = await call('export_palette', { share_url: shareLink(names), format });
      assert.equal(r.isError, false, r.text);
      assert.ok(!r.text.includes('require(') && !r.text.includes('<script'), `${format} kept ${names}`);
      assert.match(r.text, /red/, `${format} should use the auto name for ${names}`);
    }
    const gen = JSON.parse((await call('generate_palette', { share_url: shareLink(names) })).text);
    assert.deepEqual(Object.keys(gen.palettes), ['grayscale', 'red'], names);
  }
});

test('a share-link name that is a plain name is kept', async () => {
  for (const name of ['primary', 'brand-blue', 'Brand_Blue2', 'a', 'x'.repeat(32)]) {
    const gen = JSON.parse((await call('generate_palette', { share_url: shareLink(name) })).text);
    assert.deepEqual(Object.keys(gen.palettes), ['grayscale', name]);
  }
});

test('a typed palette name must be a plain name, so the agent hears about it', async () => {
  for (const name of [PAYLOAD, 'a b', '-x', '1abc', '', 'x'.repeat(33)]) {
    const r = await call('export_palette', { colors: [{ color: '#ef4444', name }], format: 'css-vars' });
    assert.equal(r.isError, true, `accepted ${JSON.stringify(name)}`);
    assert.match(r.text, /start with a letter/);
  }
  const ok = await call('export_palette', { colors: [{ color: '#ef4444', name: 'brand-red' }], format: 'css-vars' });
  assert.equal(ok.isError, false, ok.text);
  assert.match(ok.text, /--brand-red-500: /);
});

test('the SVG export escapes every name and value it writes into text or attributes', () => {
  // The renderer is a port of the site's /export-svgs, which takes whatever JSON is posted, so it must
  // be safe on its own and not lean on the name check upstream.
  const { colors } = buildColors({ lums: LUMS.split(',').map(Number), palettes: [{ hex: '#ef4444', name: 'red' }] });
  const swatches = { ...colors.red.swatches, 0: { ...colors.red.swatches[0], hex: '#fff" onload="alert(2)' } };
  const hostile = { '"/><script>alert(1)</script><x a="': { ...colors.red, swatches } };
  const svg = exportText('svg', hostile, { cssType: 'hex', url: '', lockedHexes: new Set() });
  assert.ok(!svg.includes('<script'), 'raw <script> in the SVG');
  assert.ok(!svg.includes('" onload='), 'attribute break-out in the SVG');
  assert.ok(svg.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'name shown escaped as text');
  assert.ok(svg.includes('id="&quot;/&gt;&lt;script&gt;'), 'name escaped inside the rect id');
  assert.ok(svg.includes('style="fill: #fff&quot; onload=&quot;alert(2)"'), 'hex escaped inside the style attribute');
  // Escaping leaves plain names alone.
  assert.equal(exportText('svg', colors, { cssType: 'hex', url: '', lockedHexes: new Set() }).includes('<rect id="red-100" '), true);
});
