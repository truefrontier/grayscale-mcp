// Starts dist/http.js on a free localhost port and checks routing, errors, the rate limit and a real MCP round trip.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const HTTP_JS = new URL('../dist/http.js', import.meta.url).pathname;
const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

// PORT=0 lets http.js bind a free port itself, so no other process can take it between a probe and the bind.
// Resolves with that port once the server logs it.
async function start(env = {}) {
  const child = spawn(process.execPath, [HTTP_JS], { env: { ...process.env, PORT: '0', ...env }, stdio: ['ignore', 'pipe', 'inherit'] });
  const port = await new Promise((resolve, reject) => {
    child.once('exit', (code) => reject(new Error(`http.js exited early with code ${code}`)));
    child.stdout.on('data', (d) => { const m = d.toString().match(/listening on :(\d+)\//); if (m) resolve(m[1]); });
  });
  return { base: `http://127.0.0.1:${port}`, child };
}

let srv;
before(async () => (srv = await start()));
after(() => srv.child.kill());

const post = (path, body, headers = {}) =>
  fetch(srv.base + path, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body });

test('GET /healthz is ok', async () => {
  const r = await fetch(srv.base + '/healthz');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
});

test('GET / describes the server and lists the same tools the MCP endpoint serves', async () => {
  const r = await fetch(srv.base + '/');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
  const info = await r.json();
  assert.equal(info.version, VERSION);
  assert.equal(info.mcp_endpoint, 'https://mcp.grayscale.design/mcp');
  assert.equal(info.transport, 'streamable-http');

  const client = new Client({ name: 'grayscale-test', version: '0.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(srv.base + '/mcp')));
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(info.tools, tools.map((t) => t.name));
    assert.equal(client.getServerVersion().version, VERSION);
    const r2 = await client.callTool({ name: 'color_info', arguments: { color: '#3b82f6' } });
    assert.equal(JSON.parse(r2.content[0].text).name, 'blue');
  } finally {
    await client.close();
  }
});

test('unknown paths are 404, whatever the method', async () => {
  for (const [method, path] of [['GET', '/nope'], ['POST', '/nope'], ['GET', '/mcp/']]) {
    const r = await fetch(srv.base + path, { method });
    assert.equal(r.status, 404, `${method} ${path}`);
    assert.equal(r.headers.get('access-control-allow-origin'), '*');
    assert.deepEqual(await r.json(), { error: 'not found' });
  }
});

test('GET and DELETE /mcp are 405 with Allow: POST (stateless, no SSE stream or session)', async () => {
  for (const method of ['GET', 'DELETE']) {
    const r = await fetch(srv.base + '/mcp', { method });
    assert.equal(r.status, 405, method);
    assert.equal(r.headers.get('allow'), 'POST');
    assert.deepEqual(await r.json(), { jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed. POST JSON-RPC to /mcp.' }, id: null });
  }
});

test('OPTIONS answers the CORS preflight', async () => {
  const r = await fetch(srv.base + '/mcp', { method: 'OPTIONS' });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
  assert.equal(r.headers.get('access-control-allow-methods'), 'GET, POST, OPTIONS');
  assert.equal(r.headers.get('access-control-allow-headers'), 'content-type, accept, mcp-protocol-version, mcp-session-id');
});

test('malformed JSON is a 400 parse error', async () => {
  const r = await post('/mcp', '{"jsonrpc":');
  assert.equal(r.status, 400);
  const body = await r.json();
  assert.equal(body.error.code, -32700);
  assert.equal(body.id, null);
});

test('a body over 256 KB is refused', async () => {
  const r = await post('/mcp', JSON.stringify({ pad: 'x'.repeat(300 * 1024) }));
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error.message, 'body too large');
});

test('the rate limit returns 429 after RATE_LIMIT_PER_MIN posts from one client IP', async () => {
  const limited = await start({ RATE_LIMIT_PER_MIN: '2', FLY_APP_NAME: 'grayscale-mcp' }); // fly-client-ip is only trusted on Fly
  try {
    const hit = (ip) => fetch(limited.base + '/mcp', { method: 'POST', headers: { 'fly-client-ip': ip }, body: '{' }).then((r) => r.status);
    assert.equal(await hit('203.0.113.1'), 400);
    assert.equal(await hit('203.0.113.1'), 400);
    assert.equal(await hit('203.0.113.1'), 429);
    // Each client IP gets its own bucket. The IP comes from Fly's fly-client-ip header.
    assert.equal(await hit('203.0.113.2'), 400);
    // GETs are not counted.
    assert.equal((await fetch(limited.base + '/healthz', { headers: { 'fly-client-ip': '203.0.113.1' } })).status, 200);
  } finally {
    limited.child.kill();
  }
});

test('the default rate limit is the 120 a minute the README promises', async () => {
  const fly = await start({ FLY_APP_NAME: 'grayscale-mcp' }); // its own server, so other tests' posts don't count
  try {
    const hit = () => fetch(fly.base + '/mcp', { method: 'POST', headers: { 'fly-client-ip': '203.0.113.120' }, body: '{' }).then((r) => r.status);
    for (let i = 1; i <= 120; i++) assert.equal(await hit(), 400, `post ${i}`);
    assert.equal(await hit(), 429);
  } finally {
    fly.child.kill();
  }
  assert.match(readFileSync(new URL('../README.md', import.meta.url), 'utf8'), /no auth, 120 requests a minute per IPv4 address or IPv6 \/64/);
});
