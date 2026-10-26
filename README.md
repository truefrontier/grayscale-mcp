# grayscale-mcp

An MCP server for [grayscale.design](https://grayscale.design). Agents can build luminance-based color palettes from base colors and export them the same way the site does.

The math is the site's own code. `src/site/color.js` is an unedited copy of the site's `resources/js/utils/color.js`, and the palette, naming, lock, share-link and export logic is ported line for line from `App.vue`, `PaletteRow.vue` and `ExportController.php`. Every palette and export was checked against the live site (see [Verification](#verification)).

The server is read-only. It needs no account and no secrets, stores nothing, and never calls grayscale.design.

**Remote endpoint:** `https://mcp.grayscale.design/mcp` (Streamable HTTP, stateless, no auth, 120 requests a minute per IP). `https://grayscale-mcp.fly.dev/mcp` serves the same app. Use of the hosted endpoint is covered by [Hosted service](#hosted-service).

## Install

### Claude Code

```sh
# remote (nothing to install)
claude mcp add --transport http grayscale-design https://mcp.grayscale.design/mcp

# or local stdio
git clone https://github.com/truefrontier/grayscale-mcp && cd grayscale-mcp && npm install && npm run build
claude mcp add grayscale-design -- node "$PWD/dist/stdio.js"
```

### Cursor / Grok Bot

Add this to `~/.cursor/mcp.json` (or a project's `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "grayscale-design": { "url": "https://mcp.grayscale.design/mcp" }
  }
}
```

For local stdio, use `{ "command": "node", "args": ["/absolute/path/to/grayscale-mcp/dist/stdio.js"] }`.

Grok Bot uses the same thing. Add a custom MCP connector with the URL `https://mcp.grayscale.design/mcp` and no auth.

### Any other MCP client

- Streamable HTTP: `POST https://mcp.grayscale.design/mcp`. No auth; send `Accept: application/json, text/event-stream`.
- stdio: `node dist/stdio.js`.
- Clients that only support stdio: `npx -y mcp-remote https://mcp.grayscale.design/mcp`.

## Tools

| Tool | What it does | Site feature |
| --- | --- | --- |
| `generate_palette` | Builds the grayscale scale plus one palette per base color. Each base color can have a name, a hue/saturation tweak and a lock. Takes a preset, a shade count (3–20), custom luminance targets, or a grayscale.design share link. Returns every swatch, auto names, suggested colors and a share link that opens the same palette on the site. | Steps 1–2, Hue/Sat Tweak, Lock, auto naming, share URL |
| `export_palette` | Same inputs, plus `format`: `tailwind`, `radix`, `css-vars`, `scss`, `less`, `stylus`, `auto-dark-css`, `auto-dark-tailwind`, `svg` or `json`, and `color_type`: `rgb`, `hex`, `hsl` or `oklch`. | Export Your Colors, Tailwind Auto-Dark Mode, Export Svgs |
| `luminance_scale` | The luminance targets, labels and grays for a preset (`default`, `tailwind`, `radix`, `bell`, `linear`, `dark`, `light`), a shade count, or custom targets. | Step 1 presets, shade count, sliders |
| `color_info` | Parses hex, rgb or hsl the way the site's paste box does. Returns hex/rgb/hsl/oklch, luminance, the site's color name, and WCAG contrast. | Paste parsing, color naming, Text Overlay |
| `adjust_shade` | Keeps a color's hue and saturation and solves for a target luminance. | The per-shade solver |
| `suggest_colors` | Analogous, triadic and complementary suggestions at luminance 40. | Suggested colors |
| `false_color` | A gray (0–255) or luminance → a color of any hue and saturation with the same luminance. | `/false-color` |

## Not covered

- **Image upload → palette.** The site posts the image to its own server (CSRF-protected) and reads the colors back from imgix. An MCP would be writing files to that server, so this tool leaves it out. Pass the colors directly instead.
- **Saved palettes / accounts.** The site has neither. Its only users are Statamic admins, and the share URL is how a palette gets saved, so `generate_palette` returns that URL and accepts it back as input.
- Demo videos and the feedback link.

## Site quirks kept on purpose

These are replicated so the output matches the site exactly:

- With Radix + OKLCH, the export stops after the header (the site throws inside a try/catch).
- Stylus shade labels are 100, 200, 300… whatever the count (the site passes a boolean as the count).
- When a share link has an unnamed palette before a named one, the site moves the name onto the wrong palette on load. `generate_palette({ share_url })` does the same.

## Hosted service

The endpoint at `https://mcp.grayscale.design/mcp` (and `https://grayscale-mcp.fly.dev/mcp`) is provided free and as-is, with no guarantee of uptime or accuracy. It may change, be rate-limited, or shut down at any time without notice.

**Acceptable use.** Don't abuse or overload the service, don't try to get around the rate limit, and don't use it for anything illegal. We may block traffic that does.

**Data.** The server doesn't need an account, stores nothing you send, and doesn't write request or IP logs. To enforce the rate limit it keeps each client IP address in memory for about a minute, then drops it. The service is hosted on [Fly.io](https://fly.io), which routes the traffic and handles it under its own [privacy policy](https://fly.io/legal/privacy-policy). We don't sell any data.

## License

No license has been chosen yet; see [THIRD_PARTY.md](THIRD_PARTY.md) for the third-party code in `src/site/color.js`. The grayscale.design and True Frontier names and logos aren't covered by any license to this code.

## Develop

```sh
npm install
npm run build
npm test                                    # stdio: calls every tool through an MCP client
node scripts/smoke.mjs http://localhost:8080/mcp   # HTTP, after `npm run start:http`
fly deploy                                  # remote (app: grayscale-mcp)
```

## Verification

Seven palettes (one color, three colors, presets, hue/sat tweaks, lock, 7 custom shades) were loaded in headless Chrome from the live grayscale.design share links. The site's own export computeds were compared with this server's output: 8 export tabs × 4 color types, plus `/export-svgs`.

- In the six cases compared swatch by swatch, all 163 swatches matched exactly in hex, rgb and hsl.
- 222 of 224 export texts matched byte for byte. The two that differ are only the share link in the header comment: the site's first render still has the URL from before its name-shift quirk ran.
- All 7 SVG files matched.
- Presets, the 15-shade resize, suggested colors and `/false-color` also matched.
