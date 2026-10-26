// Calls every tool through a real MCP client.
// Usage: node scripts/smoke.mjs            (spawns the stdio server)
//        node scripts/smoke.mjs <url>      (remote Streamable HTTP, e.g. https://grayscale-mcp.fly.dev/mcp)
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const url = process.argv[2];
const transport = url
  ? new StreamableHTTPClientTransport(new URL(url))
  : new StdioClientTransport({ command: process.execPath, args: [new URL('../dist/stdio.js', import.meta.url).pathname] });
const client = new Client({ name: 'grayscale-smoke', version: '1.0.0' });
await client.connect(transport);
console.log('server:', JSON.stringify(client.getServerVersion()));
const { tools } = await client.listTools();
console.log('tools:', tools.map((t) => t.name).join(', '));

const calls = [
  ['generate_palette', { colors: [{ color: '#3b82f6' }] }],
  ['generate_palette', { share_url: 'https://grayscale.design/app?lums=93.88,87.19,75.61,61.14,42.57,28.39,18.04,11.21,6.97,4.72,1.63&palettes=%23ef4444&filters=0%7C0&names=primary&labels=' }],
  ['export_palette', { colors: [{ color: '#3b82f6', name: 'primary' }], preset: 'tailwind', format: 'tailwind', color_type: 'hex' }],
  ['export_palette', { colors: [{ color: 'rgb(16, 185, 129)' }], format: 'css-vars' }],
  ['export_palette', { colors: [{ color: '#e11d48' }], format: 'svg' }],
  ['export_palette', { colors: [{ color: '#e11d48' }], format: 'auto-dark-tailwind' }],
  ['luminance_scale', { preset: 'bell', count: 9 }],
  ['color_info', { color: 'hsl(50, 100%, 70%)', against: '#ffffff' }],
  ['adjust_shade', { color: '#3b82f6', lum: 40.2 }],
  ['suggest_colors', { color: '#3b82f6' }],
  ['false_color', { gray: 200, hue: 180, sat: 50 }],
  ['color_info', { color: 'not a color at all' }, 'expect-error'],
];
let failures = 0;
for (const [name, args, expect] of calls) {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content?.[0]?.text ?? '';
  if (!!r.isError !== (expect === 'expect-error')) failures++;
  console.log(`\n--- ${name} ${JSON.stringify(args)}${r.isError ? ' [ERROR' + (expect ? ', expected' : '') + ']' : ''}\n${text.length > 700 ? text.slice(0, 700) + `\n... (${text.length} chars)` : text}`);
}
await client.close();
console.log(`\nDONE: ${calls.length} calls, ${failures} errors`);
process.exit(failures ? 1 : 0);
