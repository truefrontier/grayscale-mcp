import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as Color from './site/color.js';
import {
  PRESETS, PRESET_NAMES, PresetName, State, buildColors, buildLums, parseColorInput as parsePaste, parseShareUrl,
  resizeLums, shareUrl, suggestedColors,
} from './palette.js';
import { ColorType, FORMATS, Format, exportText } from './exports.js';
import { SAFE_NAME } from './palette.js';

export const VERSION = '0.1.2';
export const REMOTE_URL = 'https://mcp.grayscale.design/mcp';
export const TERMS_URL = 'https://github.com/truefrontier/grayscale-mcp#hosted-service';

// Color strings are short. Longer ones are refused before the paste regex, which backtracks in O(n^2)
// on a long run of spaces and would block the server.
const colorString = z.string().max(64);

const colorSchema = z.object({
  color: colorString.describe('Base color: hex (#3b82f6, 3b82f6, #38f), rgb(59, 130, 246) or hsl(217, 91%, 60%). Parsed the way the site parses a paste.'),
  name: z.string().regex(SAFE_NAME, 'name must start with a letter and use only letters, digits, - or _ (32 characters at most)').optional().describe('Palette name used in exports (e.g. "primary", "brand-blue"): a letter, then letters, digits, - or _, 32 characters at most. Default: the site auto-names it (blue, red, ...).'),
  hue_shift: z.number().min(-50).max(50).optional().describe('Site "Tweak Hue/Sat": degrees of hue added per shade away from the base color (-50..50).'),
  sat_shift: z.number().min(-30).max(30).optional().describe('Site "Tweak Hue/Sat": saturation % added per shade away from the base color (-30..30).'),
  lock: z.boolean().optional().describe("Site lock icon: the nearest grayscale shade takes this color's luminance, so the base color lands in its own palette. Like the site, that shade is rebuilt from rounded HSL, so about 1 color in 4 comes back slightly off (usually 1 RGB unit; #06fcff comes back #2dfbff). Only an exact match gets the Tailwind DEFAULT key."),
});

const scaleShape = {
  preset: z.enum(PRESET_NAMES as [PresetName, ...PresetName[]]).optional().describe('Luminance preset from the site menu: default (12 shades, 50-1100), tailwind (11 shades, 50-950), radix (12 steps), or bell/linear/dark/light which redistribute the current min..max range.'),
  count: z.number().int().min(3).max(20).optional().describe('Number of shades (site +/- buttons, 3-20).'),
  lums: z.array(z.number().min(0).max(100)).min(3).max(20).optional().describe('Custom luminance targets (0-100, WCAG relative luminance x100), lightest first. Same as dragging the site sliders.'),
};

const MAX_PALETTES = 30;
const paletteShape = {
  colors: z.array(colorSchema).max(MAX_PALETTES).optional().describe('Base colors, one palette each.'),
  ...scaleShape,
  share_url: z.string().url().max(4096).optional().describe('A grayscale.design/app?... share link to load instead of colors/lums.'),
};

function resolveLums(a: { preset?: PresetName; count?: number; lums?: number[] }) {
  let lums: number[] = a.lums ?? PRESETS.default.getValues();
  if (a.preset) lums = PRESETS[a.preset].getValues(lums, a.count ?? lums.length) as number[];
  if (a.count && a.count !== lums.length) lums = resizeLums(lums, a.count);
  return lums;
}

function resolveState(a: any, radix = false): State {
  if (a.share_url) {
    const st = parseShareUrl(a.share_url);
    // A share link skips the input schema, so hold it to the same limits as typed input.
    if (st.lums.length < 3 || st.lums.length > 20 || !st.lums.every((v) => v >= 0 && v <= 100)) {
      throw new Error('share_url lums must be 3-20 numbers from 0 to 100.');
    }
    if (st.palettes.length > MAX_PALETTES) throw new Error(`share_url can hold at most ${MAX_PALETTES} palettes.`);
    if (!st.palettes.every((p) => Math.abs(p.hue!) <= 50 && Math.abs(p.sat!) <= 30)) {
      throw new Error('share_url filters must be hue|sat pairs, hue from -50 to 50 and sat from -30 to 30.');
    }
    return { ...st, palettes: st.palettes.map((p) => ({ ...p, hex: parseColorInput(p.hex) })), radix };
  }
  return {
    lums: resolveLums(a),
    palettes: (a.colors ?? []).map((c: any) => ({ hex: parseColorInput(c.color), name: c.name, hue: c.hue_shift ?? 0, sat: c.sat_shift ?? 0, lock: c.lock })),
    radix,
  };
}

// Palettes are keyed by name, so two colors with the same (auto) name would silently lose one.
function buildDistinct(st: State) {
  const built = buildColors(st);
  const names = Object.keys(built.colors).filter((k) => k !== 'grayscale');
  if (names.length !== st.palettes.length) {
    throw new Error(`Each palette needs its own name, but ${st.palettes.length} colors produced only: ${names.join(', ')}. Pass a distinct name for each color.`);
  }
  return built;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
function swatchView(s: any) {
  return { label: String(s.label), hex: s.hex, rgb: s.rgb, hsl: s.hsl.map(r2), oklch: s.oklch, lum: r2(s.lum) };
}

function contrast(l1: number, l2: number) {
  const [a, b] = l1 > l2 ? [l1, l2] : [l2, l1];
  return r2((a / 100 + 0.05) / (b / 100 + 0.05));
}

const ok = (data: unknown) => ({ content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] });
// Lowercase like the site's color picker, so a locked color matches its generated swatch (Tailwind DEFAULT).
function parseColorInput(txt: string): string {
  const hex = parsePaste(String(txt));
  if (!hex) throw new Error(`Could not read "${txt}" as a color. Use hex (#3b82f6, 3b82f6, #38f), rgb(59, 130, 246) or hsl(217, 91%, 60%).`);
  return hex.toLowerCase();
}
const fail = (e: unknown) => ({ isError: true, content: [{ type: 'text' as const, text: String((e as Error)?.message ?? e) }] });
const wrap = <A,>(fn: (a: A) => unknown) => async (a: A) => {
  try {
    return ok(fn(a));
  } catch (e) {
    return fail(e);
  }
};

export function createServer() {
  const server = new McpServer(
    { name: 'grayscale-design', title: 'grayscale.design', version: VERSION, websiteUrl: 'https://grayscale.design' },
    {
      instructions:
        'grayscale.design builds color palettes by luminance (color value) instead of HSL lightness: every palette shares one grayscale luminance scale, so shade 500 of every color has the same contrast. Use generate_palette for swatches, export_palette for Tailwind/CSS/SCSS/LESS/Stylus/Radix/SVG/dark-mode code, and color_info for luminance and contrast. All tools are read-only and run the site\'s own math locally. Hosted service terms (as-is, no guarantees, acceptable use, data): ' + TERMS_URL,
    },
  );
  const ro = { readOnlyHint: true, openWorldHint: false, idempotentHint: true };

  server.registerTool(
    'generate_palette',
    {
      title: 'Generate luminance-based palettes',
      description: 'Generate a grayscale luminance scale plus one palette per base color, exactly as grayscale.design/app does. Each shade matches the grayscale shade\'s luminance while keeping the base hue and saturation. Returns every swatch (label, hex, rgb, hsl, oklch, luminance) and a share link that opens it on the site. Like the site\'s, the link keeps luminance targets to 2 decimals, so with the bell, linear, dark or light presets, added shades or a lock, a shade can open 1-2 RGB units off.',
      inputSchema: paletteShape,
      annotations: ro,
    },
    wrap((a: any) => {
      const st = resolveState(a);
      const { colors, lums } = buildDistinct(st);
      const out: any = { share_url: shareUrl(st, lums.map((l) => l.lum)), shade_labels: lums.map((l) => String(l.label)), luminance_targets: lums.map((l) => r2(l.lum)), palettes: {} };
      for (const [name, c] of Object.entries<any>(colors)) {
        out.palettes[name] = { ...(c.hex ? { base: c.hex, hue_shift: c.filters.hue, sat_shift: c.filters.sat } : {}), swatches: Object.values(c.swatches).map(swatchView) };
      }
      const first = st.palettes[0]?.hex;
      if (first) out.suggested_colors = suggestedColors(first, st.palettes.map((p) => p.hex));
      return out;
    }),
  );

  server.registerTool(
    'export_palette',
    {
      title: 'Export palette code',
      description: 'Export palettes as the code the site\'s "Export Your Colors" and "Tailwind Auto-Dark Mode" sections produce: tailwind (theme colors object), radix (light + dark scales), css-vars, scss, less, stylus, auto-dark-css (CSS variables that flip in dark mode), auto-dark-tailwind (tailwind.config.js for those variables), svg (the "Export Svgs" swatch sheet) or json (raw swatch data).',
      inputSchema: {
        ...paletteShape,
        format: z.enum(FORMATS).describe('Output format.'),
        color_type: z.enum(['rgb', 'hex', 'hsl', 'oklch']).optional().describe('Color notation for tailwind/radix/css-vars/scss/less/stylus. Site default: rgb. Radix with oklch returns only the header comment, as on the site, so pick another notation for Radix.'),
      },
      annotations: ro,
    },
    wrap((a: any) => {
      const fmt = a.format as Format;
      const st = resolveState(a, fmt === 'radix');
      const { colors, lums, lockedHexes } = buildDistinct(st);
      const url = shareUrl(st, lums.map((l) => l.lum));
      return exportText(fmt, colors, { cssType: (a.color_type ?? 'rgb') as ColorType, url, lockedHexes });
    }),
  );

  server.registerTool(
    'luminance_scale',
    {
      title: 'Build a luminance scale',
      description: 'Return the grayscale luminance scale (step 1 on the site): luminance targets, shade labels and the gray for each shade. Use a preset, change the shade count, or pass custom targets.',
      inputSchema: scaleShape,
      annotations: ro,
    },
    wrap((a: any) => {
      const lums = resolveLums(a);
      return {
        presets: Object.fromEntries(PRESET_NAMES.map((p) => [p, PRESETS[p].label])),
        shades: buildLums(lums).map((l) => ({ label: String(l.label), lum: r2(l.lum), rgb: l.rgb, hex: Color.RGBToHex(l.rgb[0], l.rgb[1], l.rgb[2]) })),
        url_lums: lums.map((v) => v.toFixed(2)).join(','),
      };
    }),
  );

  server.registerTool(
    'color_info',
    {
      title: 'Color luminance and contrast',
      description: 'Parse a color the way the site does and return hex, rgb, hsl, oklch, its luminance (the site\'s color value, 0-100), the site\'s auto name, and WCAG contrast ratios against white, black and an optional second color.',
      inputSchema: {
        color: colorString.describe('Hex, rgb(...) or hsl(...).'),
        against: colorString.optional().describe('Optional second color for a contrast ratio.'),
      },
      annotations: ro,
    },
    wrap((a: { color: string; against?: string }) => {
      const info = (c: string) => {
        const hex = parseColorInput(c);
        const { r, g, b } = Color.hexToRGB(hex);
        const rgb = [Number(r), Number(g), Number(b)];
        const hsl = Color.RGBToHSL(r, g, b);
        const lum = Color.lumFromRGB(r, g, b);
        return { hex, rgb, hsl: [hsl.h, hsl.s, hsl.l], oklch: Object.values(Color.RGBToOKLCH(rgb[0], rgb[1], rgb[2])), lum: r2(lum), name: Color.colorName(hsl.h, hsl.s, hsl.l), _lum: lum };
      };
      const c = info(a.color);
      const out: any = { ...c, contrast_vs_white: contrast(c._lum, 100), contrast_vs_black: contrast(c._lum, 0) };
      if (a.against) {
        const d = info(a.against);
        out.against = { hex: d.hex, lum: d.lum, contrast: contrast(c._lum, d._lum) };
      }
      delete out._lum;
      return out;
    }),
  );

  server.registerTool(
    'adjust_shade',
    {
      title: 'Move a color to a target luminance',
      description: 'Keep a color\'s hue and saturation and find the lightness that hits a target luminance, using the site\'s solver. This is how every palette shade is made.',
      inputSchema: {
        color: colorString.describe('Hex, rgb(...) or hsl(...).'),
        lum: z.number().min(0).max(100).describe('Target luminance, 0-100.'),
      },
      annotations: ro,
    },
    wrap((a: { color: string; lum: number }) => {
      const hex = parseColorInput(a.color);
      const { r, g, b } = Color.hexToRGB(hex);
      const { h, s } = Color.RGBToHSL(r, g, b);
      const l = Color.lightnessFromHSLum(h, s, a.lum);
      const rgb = Object.values(Color.HSLtoRGB(h, s, l)).map(Math.round);
      return { input: hex, target_lum: a.lum, hex: Color.RGBToHex(rgb[0], rgb[1], rgb[2]), rgb, hsl: [h, s, r2(l)], actual_lum: r2(Color.lumFromRGB(rgb[0], rgb[1], rgb[2])) };
    }),
  );

  server.registerTool(
    'suggest_colors',
    {
      title: 'Suggest companion colors',
      description: 'The site\'s suggested-color swatches: analogous (+-60), triadic (+-120) and complementary hues of a base color, all at luminance 40.',
      inputSchema: { color: colorString.describe('Base color.') },
      annotations: ro,
    },
    wrap((a: { color: string }) => suggestedColors(parseColorInput(a.color), [parseColorInput(a.color)])),
  );

  server.registerTool(
    'false_color',
    {
      title: 'False color from a gray',
      description: 'The site\'s /false-color tool: pick a gray (0-255) or a luminance, then get a color of any hue and saturation with the gray\'s luminance.',
      inputSchema: {
        gray: z.number().int().min(0).max(255).optional().describe('Gray channel value 0-255 (site default 200).'),
        lum: z.number().min(0).max(100).optional().describe("Or a luminance 0-100 instead of gray. Like the site's luminance box, this sets the gray to the red channel of a teal at that luminance, so the luminance actually used is usually lower (lum 50 gives 12.74). Read gray.lum for it. To hit a luminance exactly, use adjust_shade."),
        hue: z.number().min(0).max(359).optional().describe('Hue 0-359 (site default 180).'),
        sat: z.number().min(0).max(100).optional().describe('Saturation 0-100 (site default 50).'),
      },
      annotations: ro,
    },
    wrap((a: { gray?: number; lum?: number; hue?: number; sat?: number }) => {
      // FalseColor.vue: typing a luminance sets the gray to RGBFromLum(lum).r; the swatch uses that gray's luminance.
      const gray = a.lum !== undefined ? Color.RGBFromLum(a.lum).r : (a.gray ?? 200);
      const lum = Color.lumFromRGB(gray, gray, gray);
      const { r, g, b } = Color.RGBFromLum(lum, a.hue ?? 180, a.sat ?? 50);
      return { gray: { rgb: [gray, gray, gray], hex: Color.RGBToHex(gray, gray, gray), lum: r2(lum) }, false_color: { rgb: [r, g, b], hex: Color.RGBToHex(r, g, b), hue: a.hue ?? 180, sat: a.sat ?? 50, lum: r2(Color.lumFromRGB(r, g, b)) } };
    }),
  );

  return server;
}
