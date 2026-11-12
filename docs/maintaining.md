# Maintaining grayscale-mcp

**Bottom line:** the server's math is grayscale.design's own code, copied or ported into this repo. To keep it right, do two things: run `npm test` before every merge, and re-check the copies whenever the site's palette code changes.

This page covers:

- running the tests, and what each test file checks
- what comes from the site, and how to check it's still in step
- where the MCP knowingly differs from the site today
- what to do when the site changes

For install, deploy and the hosted service, see the [README](../README.md). The colorName rules are in [colorName-spec.md](colorName-spec.md).

## Run the tests

```sh
npm ci --ignore-scripts
npm test
```

`npm test` runs `tsc`, then every file in `test/`, then `scripts/smoke.mjs`, which calls each tool over stdio. It needs no network and no secrets. It runs on Node 20 or later. CI and the `Dockerfile` use Node 22.

| File | What it checks |
| --- | --- |
| `test/tools.test.mjs` | Every tool through an in-memory MCP client, against literal values from the site. It also checks schema errors, and that the README, `server.json` and `package.json` agree with the server. |
| `test/invariants.test.mjs` | The tools' promises on seeded random inputs. For example: every shade is within 0.5 luminance of its grayscale shade, a share link reads back to the same palette, and contrast is the same both ways. |
| `test/color-math.test.mjs` | The copied color math in `src/site/color.js`: hex, HSL, WCAG luminance and the lightness solver. |
| `test/color-name.test.mjs` | `colorName` against [colorName-spec.md](colorName-spec.md). |
| `test/hue-wrap.test.mjs` | "Tweak Hue" wrapping past 0 and 360. Palettes that stay in range must match `in-range-palettes.snapshot.json`. |
| `test/security.test.mjs` | Hostile input: what a crafted share link or argument can put into generated code, and what it can do to the HTTP server. |
| `test/http.test.mjs` | The HTTP server on a free local port: routes, CORS, the body limit and the rate limit. |
| `scripts/smoke.mjs` | 12 tool calls over stdio. Pass a URL to run the same calls against a remote server, for example after a deploy. |

### The 3 "todo" tests

`npm test` reports 3 tests as `todo`. They run, and their failures are expected, so they don't fail the suite. Each marks a spot where the site's code disagrees with what it should do:

- `HSLtoRGB(360, …)` doesn't equal `HSLtoRGB(0, …)`. `color.js` has no branch for a hue of 360, so callers wrap it to 0 first.
- Two `colorName` cases where the spec and `color.js` disagree, when saturation is `undefined` or `NaN`.

They stay `todo` until someone decides whether the site or the spec should change. Fixing them here alone would break parity with the site.

### When a test fails

- **`tools.test.mjs` fails:** a tool's output changed. If you meant to change it, check the new value against grayscale.design before you update the test. The README's [Verification](../README.md#verification) section says how the values were checked.
- **`invariants.test.mjs` fails:** the message names the input that broke. Rerun just that file with `node --test test/invariants.test.mjs`. The seed is fixed, so the same input fails every time.
- **The HTTP tests fail with `EADDRINUSE`:** they shouldn't. Each test server starts on `PORT=0`, so the OS picks a free port. Report it as a bug.

## Keep the copies in step with the site

The README promises that the math is the site's own code. These files carry that promise:

| File here | From grayscale.design | How |
| --- | --- | --- |
| `src/site/color.js` | `resources/js/utils/color.js` | Copied unedited, under a 2-line header |
| `src/palette.ts` | `resources/js/Pages/App.vue`, `resources/js/components/PaletteRow.vue` and `GrayscaleRow.vue`, at commit `a95fde7` | Ported by hand. Comments name the site method each step comes from. |
| `src/exports.ts` | The export computeds in `App.vue`, and `app/Http/Controllers/ExportController.php` for SVG | Ported by hand |
| `src/logo.ts` | The logo PNG that `ExportController.php` embeds in SVG exports | Copied |
| `false_color` in `src/server.ts` | `resources/js/Pages/FalseColor.vue` | Ported by hand |

**Last checked: Nov 12, 2026.** grayscale.design's `origin/master` as last fetched was `5c240c5` (Nov 9, 2026). `color.js` was identical, and none of the ported files had changed since `a95fde7`.

### How to check

With `grayscale.design` cloned next to this repo, run these from this repo's root. They read the site's `origin/master` from git, so it doesn't matter which branch the checkout is on, and they don't change any file.

```sh
git -C ../grayscale.design fetch -q origin

# 1. color.js: no output means identical. (Our copy has a 2-line header.)
git -C ../grayscale.design show origin/master:resources/js/utils/color.js | diff - <(tail -n +3 src/site/color.js)

# 2. The ported files: no output means the site hasn't changed them since the port.
git -C ../grayscale.design diff --stat a95fde7 origin/master -- \
  resources/js/Pages/App.vue resources/js/components/PaletteRow.vue resources/js/components/GrayscaleRow.vue \
  resources/js/Pages/FalseColor.vue app/Http/Controllers/ExportController.php
```

Step 1 needs bash or zsh for `<(...)`.

## Where the MCP differs from the site today

These are on purpose. Each MCP fix has a matching grayscale.design PR, and the two match again once that PR merges:

| Topic | MCP | Site PR, still open on Nov 12, 2026 |
| --- | --- | --- |
| "Tweak Hue" wrapping past 0 | #2 | grayscale.design#22 |
| Refusing out-of-range or junk colors in the paste box | #3 | grayscale.design#23. It adds the site's `utils/parse-color.js`, which `src/palette.ts` cites. |
| Reserved-word and clashing names in the Radix export | #8, #9 | grayscale.design#27 covers the same names |

The README lists the rest:

- [Safety limits (not on the site)](../README.md#safety-limits-not-on-the-site): input caps the site doesn't need, because it isn't a public API.
- [Site quirks kept on purpose](../README.md#site-quirks-kept-on-purpose): site behavior the MCP copies even though it's odd.

## When the site changes

1. **If `color.js` changed:** copy it over and keep the 2-line header. Run `npm test`. `color-math.test.mjs` and `color-name.test.mjs` show what moved.
2. **If a ported file changed:** read the site diff and port the change by hand into `src/palette.ts`, `src/exports.ts` or `src/server.ts`. Then update the commit named at the top of `src/palette.ts`.
3. **If `tools.test.mjs` fails:** check the new values against the live site before you update the expected values.
4. **If a site PR in the table above merges:** remove its row.
5. Update the "Last checked" line above.
