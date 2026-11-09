// Hostile input through the real tools: what a crafted share link or argument can put into
// generated code, and what it can do to the HTTP server. Run with `npm test` (builds dist/ first).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
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

test('the JavaScript exports still parse when a name has a hyphen', async () => {
  // brand-blue is allowed, and a palette named grayscale becomes grayscale-alt (site rule).
  const colors = [{ color: '#3b82f6', name: 'brand-blue' }, { color: '#ef4444', name: 'grayscale' }, { color: '#10b981', name: 'a-b-c' }];
  for (const format of ['tailwind', 'radix', 'auto-dark-tailwind']) {
    const r = await call('export_palette', { colors, format });
    assert.equal(r.isError, false, r.text);
    assert.doesNotThrow(() => new vm.Script(r.text), `${format} is not valid JavaScript:\n${r.text.slice(0, 400)}`);
  }
  const radix = (await call('export_palette', { colors, format: 'radix' })).text;
  assert.match(radix, /^const brandBlue = \{\n  'brand-blue1': /m);
  assert.match(radix, /^const grayscaleAltDark = \{\n  'grayscale-alt1': /m);
  const config = (await call('export_palette', { colors, format: 'auto-dark-tailwind' })).text;
  assert.match(config, /^      'brand-blue': setAsCssVariable\('brand-blue'\),$/m);
  assert.match(config, /^      grayscale: setAsCssVariable\('grayscale'\),$/m); // plain names stay unquoted, as on the site
});

test('the JavaScript exports still load when a name is a reserved word', async () => {
  // Reserved words, strict-mode and module-only ones, eval/arguments, and the three globals a script can't redeclare.
  const words = ['break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else', 'enum', 'export',
    'extends', 'false', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof', 'new', 'null', 'return', 'super', 'switch',
    'this', 'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'implements', 'interface', 'let', 'package', 'private',
    'protected', 'public', 'static', 'yield', 'await', 'arguments', 'eval', 'undefined', 'NaN', 'Infinity'];
  for (const name of words) {
    const colors = [{ color: '#3b82f6', name }];
    for (const format of ['tailwind', 'auto-dark-tailwind']) {
      const r = await call('export_palette', { colors, format });
      assert.doesNotThrow(() => new vm.Script(r.text), `${format} with ${name}`);
    }
    const radix = (await call('export_palette', { colors, format: 'radix' })).text;
    assert.doesNotThrow(() => new vm.Script(radix).runInNewContext({}), `radix with ${name}, as a script:\n${radix.slice(0, 200)}`);
    await import('data:text/javascript,' + encodeURIComponent(radix)).catch((e) => assert.fail(`radix with ${name}, as a module: ${e.message}`));
    assert.match(radix, new RegExp(`^const _${name} = \\{\\n  '${name}1': `, 'm'));
    assert.match(radix, new RegExp(`^const _${name}Dark = \\{\\n  '${name}1': `, 'm'));
  }
  // Ordinary names keep their plain identifier.
  assert.match((await call('export_palette', { colors: [{ color: '#3b82f6', name: 'classic' }], format: 'radix' })).text, /^const classic = \{$/m);
});

test('Radix refuses two names that would become the same const, and names both', async () => {
  const cases = [
    [['brand-blue', 'brandBlue'], /"brand-blue" and "brandBlue" would both be const brandBlue\./],
    [['foo', 'foo-dark'], /"foo" \(its dark scale\) and "foo-dark" would both be const fooDark\./],
    [['foo-dark', 'foo'], /"foo-dark" and "foo" \(its dark scale\) would both be const fooDark\./],
  ];
  for (const [names, msg] of cases) {
    const colors = [{ color: '#3b82f6', name: names[0] }, { color: '#ef4444', name: names[1] }];
    const r = await call('export_palette', { colors, format: 'radix' });
    let parses = 'parses';
    try { new vm.Script(r.text); } catch (e) { parses = `doesn't parse: ${e.message}`; }
    assert.equal(r.isError, true, `${names.join(' + ')}: expected an error, got Radix that ${parses}`);
    assert.match(r.text, msg);
    // Only Radix turns names into consts; the other formats keep both palettes.
    const css = await call('export_palette', { colors, format: 'css-vars' });
    assert.equal(css.isError, false, css.text);
  }
});

test('long color strings are refused before the color regex sees them', async () => {
  // '1' + spaces + 'x' makes the rgb/hsl regex backtrack in O(n^2): about 1 s at 50k spaces and
  // about 30 s at the 256 KB body limit, all of it blocking the server.
  const slow = '1' + ' '.repeat(50_000) + 'x';
  const calls = [
    ['color_info', { color: slow }],
    ['color_info', { color: '#3b82f6', against: slow }],
    ['adjust_shade', { color: slow, lum: 40 }],
    ['suggest_colors', { color: slow }],
    ['generate_palette', { colors: [{ color: slow }] }],
  ];
  for (const [name, args] of calls) {
    const t = performance.now();
    const r = await call(name, args);
    const ms = performance.now() - t;
    assert.equal(r.isError, true, name);
    assert.match(r.text, /at most 64 character/, name);
    assert.ok(ms < 200, `${name} took ${ms.toFixed(0)} ms`);
  }
  assert.equal((await call('color_info', { color: 'hsl(217, 91%, 60%)' })).isError, false);
});

test('a share link longer than 4096 characters is refused', async () => {
  const long = shareLink('a'.repeat(4096));
  assert.equal((await call('generate_palette', { share_url: long })).isError, true);
  assert.equal((await call('generate_palette', { share_url: shareLink('primary') })).isError, false);
});

// --- HTTP server (dist/http.js on a free localhost port) ---

const HTTP_JS = new URL('../dist/http.js', import.meta.url).pathname;
// PORT=0 lets http.js bind a free port itself, so no other process can take it between a probe and the bind.
// Resolves with that port once the server logs it.
async function start(env = {}) {
  const childEnv = { ...process.env, PORT: '0', ...env };
  for (const k of Object.keys(childEnv)) if (childEnv[k] === undefined) delete childEnv[k];
  const child = spawn(process.execPath, [HTTP_JS], { env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => (stderr += d));
  const port = await new Promise((resolve, reject) => {
    child.once('exit', (code) => reject(new Error(`http.js exited early with code ${code}: ${stderr}`)));
    child.stdout.on('data', (d) => { const m = d.toString().match(/listening on :(\d+)\//); if (m) resolve(m[1]); });
  });
  return { base: `http://127.0.0.1:${port}`, child, stderr: () => stderr };
}
// A malformed body is answered with a 400 without building an MCP server, so posts are cheap.
const post = (base, headers = {}) => fetch(base + '/mcp', { method: 'POST', headers, body: '{' }).then((r) => r.status);

test('a bad RATE_LIMIT_PER_MIN falls back to 120 a minute instead of turning the limit off', async () => {
  for (const value of ['abc', 'Infinity', '', '0', '-5', '2.5']) {
    const srv = await start({ RATE_LIMIT_PER_MIN: value, FLY_APP_NAME: undefined });
    try {
      const statuses = [];
      for (let i = 0; i < 121; i++) statuses.push(await post(srv.base));
      assert.equal(statuses.filter((s) => s === 400).length, 120, `RATE_LIMIT_PER_MIN=${JSON.stringify(value)}`);
      assert.equal(statuses[120], 429, `RATE_LIMIT_PER_MIN=${JSON.stringify(value)}`);
      assert.match(srv.stderr(), /RATE_LIMIT_PER_MIN.*using 120/);
    } finally {
      srv.child.kill();
    }
  }
});

test('off Fly, a client cannot pick its own rate-limit bucket with fly-client-ip or x-forwarded-for', async () => {
  const srv = await start({ RATE_LIMIT_PER_MIN: '2', FLY_APP_NAME: undefined });
  try {
    assert.equal(await post(srv.base, { 'fly-client-ip': '203.0.113.1' }), 400);
    assert.equal(await post(srv.base, { 'x-forwarded-for': '198.51.100.1' }), 400);
    assert.equal(await post(srv.base, { 'fly-client-ip': '203.0.113.2' }), 429);
    assert.equal(await post(srv.base, { 'x-forwarded-for': '198.51.100.2, 10.0.0.1' }), 429);
  } finally {
    srv.child.kill();
  }
});

test('on Fly, IPv6 clients share one rate-limit bucket per /64', async () => {
  const srv = await start({ RATE_LIMIT_PER_MIN: '2', FLY_APP_NAME: 'grayscale-mcp' });
  try {
    const from = (ip) => post(srv.base, { 'fly-client-ip': ip });
    // One client usually gets a whole /64, so stepping through its addresses must not reset the count.
    assert.equal(await from('2001:db8:1:2::1'), 400);
    assert.equal(await from('2001:db8:1:2:ffff:ffff:ffff:ffff'), 400);
    assert.equal(await from('2001:0DB8:0001:0002::3'), 429);
    // The next /64 over is a different client.
    assert.equal(await from('2001:db8:1:3::1'), 400);
  } finally {
    srv.child.kill();
  }
});

test('IPv4 clients keep one rate-limit bucket per address, also in the ::ffff: form a dual-stack socket reports', async () => {
  const srv = await start({ RATE_LIMIT_PER_MIN: '2', FLY_APP_NAME: 'grayscale-mcp' });
  try {
    const from = (ip) => post(srv.base, { 'fly-client-ip': ip });
    assert.equal(await from('::ffff:198.51.100.1'), 400);
    assert.equal(await from('::ffff:198.51.100.1'), 400);
    assert.equal(await from('::ffff:198.51.100.1'), 429);
    // Mapped IPv4 addresses all sit in ::/64, so a plain /64 rule would put every IPv4 client in one bucket.
    assert.equal(await from('::ffff:198.51.100.2'), 400);
    assert.equal(await from('198.51.100.3'), 400);
  } finally {
    srv.child.kill();
  }
});

test('on Fly, the rate limit buckets by fly-client-ip and ignores x-forwarded-for', async () => {
  const srv = await start({ RATE_LIMIT_PER_MIN: '2', FLY_APP_NAME: 'grayscale-mcp' });
  try {
    const a = { 'fly-client-ip': '203.0.113.1' };
    assert.equal(await post(srv.base, a), 400);
    assert.equal(await post(srv.base, { ...a, 'x-forwarded-for': '198.51.100.1' }), 400);
    assert.equal(await post(srv.base, { ...a, 'x-forwarded-for': '198.51.100.2' }), 429);
    assert.equal(await post(srv.base, { 'fly-client-ip': '203.0.113.2' }), 400);
  } finally {
    srv.child.kill();
  }
});

test('the rate-limit table holds at most 10,000 clients, so rotating IPv6 addresses cannot grow it', async () => {
  const srv = await start({ RATE_LIMIT_PER_MIN: '2', FLY_APP_NAME: 'grayscale-mcp' });
  try {
    const first = { 'fly-client-ip': '2001:db8::1' };
    assert.deepEqual([await post(srv.base, first), await post(srv.base, first), await post(srv.base, first)], [400, 400, 429]);
    // 10,000 more addresses, the way one IPv6 client can rotate through its own prefix. None is refused.
    const statuses = [];
    for (let i = 0; i < 10_000; i += 100) {
      statuses.push(...(await Promise.all(Array.from({ length: 100 }, (_, j) => post(srv.base, { 'fly-client-ip': `2001:db8:1::${(i + j).toString(16)}` })))));
    }
    assert.ok(statuses.every((s) => s === 400));
    // The table is full, so the oldest bucket (the first client's) was dropped and starts over.
    assert.equal(await post(srv.base, first), 400);
    // The newest buckets are kept: the last address is still counted.
    const last = { 'fly-client-ip': '2001:db8:1::270f' };
    assert.deepEqual([await post(srv.base, last), await post(srv.base, last)], [400, 429]);
  } finally {
    srv.child.kill();
  }
});
