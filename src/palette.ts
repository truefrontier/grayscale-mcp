// Port of the palette logic in grayscale.design resources/js/Pages/App.vue and
// resources/js/components/PaletteRow.vue (commit a95fde7). Comments cite the
// original method so each step can be checked against the site.
import * as Color from './site/color.js';

export const SITE_URL = 'https://grayscale.design';

// App.vue data().presets
export const PRESETS = {
  bell: {
    label: 'Bell Curve',
    getValues(lums: number[], count: number) {
      const min = lums.reduce((num, val) => (val < num ? val : num), 100);
      const max = lums.reduce((num, val) => (val > num ? val : num), 0);
      const spread = max - min;
      const space = spread / (count - 1);
      const mid = spread / 2 + min;
      const half = (count - 1) / 2;
      const vals = [min];
      let i = 1;
      while (i < count - 1) {
        let val: number, virtualIndex: number;
        if (i === half) {
          val = mid;
        } else if (i < half) {
          virtualIndex = half - i;
          val = i * space;
          val *= Math.pow((half - 1) / half, virtualIndex);
          val = Math.max(val + min, min);
        } else {
          virtualIndex = i - half;
          val = (count - 1 - i) * space;
          val *= Math.pow((half - 1) / half, virtualIndex);
          val = Math.min(max - val, max);
        }
        vals.push(val);
        i++;
      }
      vals.push(max);
      vals.reverse();
      return vals;
    },
  },
  linear: {
    label: 'Linear',
    getValues(lums: number[], count: number) {
      const min = lums.reduce((num, val) => (val < num ? val : num), 100);
      const max = lums.reduce((num, val) => (val > num ? val : num), 0);
      const space = (max - min) / (count - 1);
      const vals = [min];
      let i = 1;
      while (i < count - 1) {
        vals.push(min + i * space);
        i++;
      }
      vals.push(max);
      vals.reverse();
      return vals;
    },
  },
  dark: {
    label: 'Darker Side',
    getValues(lums: number[], count: number) {
      const min = lums.reduce((num, val) => (val < num ? val : num), 100);
      const max = lums.reduce((num, val) => (val > num ? val : num), 0);
      const space = (max - min) / (count - 1);
      const vals = [min];
      let i = 1;
      while (i < count - 1) {
        let val = i * space;
        val *= Math.pow((count - 1) / count, count - (i * (count + 1)) / count);
        vals.push(Math.min(val + min, max));
        i++;
      }
      vals.push(max);
      vals.reverse();
      return vals;
    },
  },
  light: {
    label: 'Lighter Side',
    getValues(lums: number[], count: number) {
      const min = lums.reduce((num, val) => (val < num ? val : num), 100);
      const max = lums.reduce((num, val) => (val > num ? val : num), 0);
      const space = (max - min) / (count - 1);
      const vals = [min];
      let i = count - 2;
      while (i > 0) {
        let val = i * space;
        val *= Math.pow((count - 1) / count, count - (i * (count + 1)) / count);
        vals.push(Math.max(max - val, min));
        i--;
      }
      vals.push(max);
      vals.reverse();
      return vals;
    },
  },
  default: {
    label: 'Default',
    getValues() {
      return [93.87, 82.28, 68.67, 49.1, 40.2, 32.78, 13.29, 9.31, 6.3, 2.62, 1.3, 0.52];
    },
  },
  tailwind: {
    label: 'Tailwind',
    getValues() {
      return [93.88, 87.19, 75.61, 61.14, 42.57, 28.39, 18.04, 11.21, 6.97, 4.72, 1.63];
    },
  },
  radix: {
    label: 'Radix',
    getValues() {
      return [98.1, 96.4, 90.1, 83.3, 75.6, 65.8, 52.6, 37.4, 15.2, 12.8, 10.2, 1.2];
    },
  },
} as const;
export type PresetName = keyof typeof PRESETS;
export const PRESET_NAMES = Object.keys(PRESETS) as PresetName[];

export type Swatch = {
  lum: number;
  rgb: number[];
  hex: string;
  hsl: number[];
  oklch: number[];
  label: string | number;
};
export type PaletteInput = {
  hex: string; // as typed into the site (after paste parsing)
  name?: string;
  hue?: number; // App.vue filters.hue, -50..50
  sat?: number; // App.vue filters.sat, -30..30
  lock?: boolean; // App.vue toggleLocked: snap the grayscale shade nearest this color to its luminance
};
export type Palette = { name: string; hex: string; filters: { hue: number; sat: number }; swatches: Record<string, Swatch> };
export type Colors = Record<string, Palette | { name: string; swatches: Record<string, Swatch> }>;

// App.vue getValueLabel (cssTab-dependent)
export function getValueLabel(i: number | string, count: number | boolean, radix = false): string | number {
  if (radix) return parseInt(String(i), 10) + 1;
  // eslint-disable-next-line eqeqeq
  if ((count as any) == 11 && (i as any) == 10) return '950';
  if ((count as any) >= 10) {
    // eslint-disable-next-line eqeqeq
    return (i as any) == 0 ? '50' : parseInt(String(i), 10) + '00';
  }
  return parseInt(String(i), 10) + 1 + '00';
}

// App.vue / GrayscaleRow.vue lumToGrayscaleRGB
export function lumToGrayscaleRGB(lum: number): number[] {
  const newL = Color.lightnessFromHSLum(0, 0, lum);
  return Object.values(Color.HSLtoRGB(0, 0, newL)).map(Math.round);
}

// App.vue setLumsCount: the +/- buttons (3..20). Adds halve the previous value, removes drop from the end.
export function resizeLums(values: number[], newCount: number): number[] {
  if (newCount < 3 || newCount > 20) throw new Error('count must be between 3 and 20 (the site limit)');
  const out = values.slice(0, newCount);
  while (out.length < newCount) out.push(out[out.length - 1] / 2);
  return out;
}

// App.vue onPaste: how the site turns pasted text into a hex.
export function parseColorInput(txt: string): string {
  const input = txt.trim();
  const hexMatch = input.match(/^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/);
  if (hexMatch) {
    let hexValue = `#${hexMatch[1]}`;
    if (hexValue.length === 4) hexValue = '#' + [...hexValue.slice(1)].map((c) => c + c).join('');
    return hexValue;
  }
  const hslMatch = input.match(/(\d+)\s*[,\s]\s*(\d+)(%?)\s*[,\s]\s*(\d+)(%?)/);
  if (hslMatch && (hslMatch[3] === '%' || hslMatch[5] === '%' || input.toLowerCase().includes('hsl'))) {
    const rgb = Color.HSLtoRGB(parseInt(hslMatch[1]), parseInt(hslMatch[2]), parseInt(hslMatch[4]));
    return Color.RGBToHex(Math.round(rgb.r), Math.round(rgb.g), Math.round(rgb.b));
  } else if (hslMatch) {
    const r = Math.min(255, Math.max(0, parseInt(hslMatch[1])));
    const g = Math.min(255, Math.max(0, parseInt(hslMatch[2])));
    const b = Math.min(255, Math.max(0, parseInt(hslMatch[4])));
    return Color.RGBToHex(r, g, b);
  }
  const cleaned = input.replace(/[^0-9A-Fa-f]/g, '').slice(0, 6);
  return cleaned.length >= 3 ? `#${cleaned}` : '#000000';
}

// PaletteRow.vue 'palette.hex' watcher: 3-digit hex is expanded before generating.
function expandHex(val: string) {
  return val.length === 4 ? '#' + [...val.replace('#', '')].reduce((str, cur) => str + cur + cur, '') : val;
}

export type GrayscaleLum = { lum: number; rgb: number[]; label: string | number };

// App.vue setLums
export function buildLums(values: number[], radix = false): GrayscaleLum[] {
  return values.map((val, i) => ({ lum: val, rgb: lumToGrayscaleRGB(val), label: getValueLabel(i, values.length, radix) }));
}

// App.vue toggleLocked (lock on): the nearest grayscale shade takes the color's luminance.
export function lockHex(lums: GrayscaleLum[], hex: string, lockedIdx: Set<number>) {
  const rgb = Object.values(Color.hexToRGB(hex));
  const lum = Color.lumFromRGB(...(rgb as [any, any, any]));
  const closest = Color.closestLum(lums.map((l) => l.lum), lum);
  const lumIndex = parseInt(Object.keys(closest)[0], 10);
  if (lockedIdx.has(lumIndex)) throw new Error(`${hex}: this color value is already LOCKED (shade index ${lumIndex})`);
  lums[lumIndex] = { lum, rgb: lumToGrayscaleRGB(lum), label: lums[lumIndex].label };
  lockedIdx.add(lumIndex);
}

// PaletteRow.vue updateBase + generateSwatches. In the browser, generateSwatches writes each
// swatch's actual luminance back into palette.swatches[i].lum, which re-triggers the `lums`
// watcher and regenerates until the luminances stop changing. We run the same loop to its fixed point.
export function generateSwatches(baseHex: string, lums: GrayscaleLum[], filters: { hue: number; sat: number }) {
  const hex = expandHex(baseHex);
  const rgb0 = Object.values(Color.hexToRGB(hex));
  const baseHSL = Color.RGBToHSL(...(rgb0 as [any, any, any]));
  const baseLum = Color.lumFromRGB(...(rgb0 as [any, any, any]));
  let targets = lums.map((l) => l.lum);
  let swatches: Swatch[] = [];
  for (let iter = 0; iter < 100; iter++) {
    const closest = Color.closestLum(targets, baseLum);
    const closestIndex = Number(Object.keys(closest)[0]);
    swatches = targets.map((target, i) => {
      const diffIndex = Math.abs(closestIndex - i);
      let newH = baseHSL.h + parseFloat(String(filters.hue)) * diffIndex;
      if (newH < 0) newH = 360 - newH;
      if (newH > 360) newH = newH - 360;
      let newS = baseHSL.s + parseFloat(String(filters.sat)) * diffIndex;
      if (newS < 0) newS = Math.max(newS, 0);
      if (newS > 100) newS = Math.min(newS, 100);
      const newL = Color.lightnessFromHSLum(newH, newS, target);
      const rgb = Object.values(Color.HSLtoRGB(newH, newS, newL)).map(Math.round);
      return {
        lum: Color.lumFromRGB(rgb[0], rgb[1], rgb[2]),
        rgb,
        hex: Color.RGBToHex(rgb[0], rgb[1], rgb[2]),
        hsl: [newH, newS, newL],
        oklch: Object.values(Color.RGBToOKLCH(rgb[0], rgb[1], rgb[2])),
        label: lums[i].label,
      };
    });
    const next = swatches.map((s) => s.lum);
    if (next.every((v, i) => v === targets[i])) break;
    targets = next;
  }
  return { hex, swatches, baseHSL, baseLum, closestIndex: Number(Object.keys(Color.closestLum(targets, baseLum))[0]) };
}

export type State = { lums: number[]; palettes: PaletteInput[]; radix?: boolean };

// App.vue cssColors: the object every export is built from.
export function buildColors(state: State) {
  const lockedIdx = new Set<number>();
  const lums = buildLums(state.lums, !!state.radix);
  const lockedHexes = new Set<string>();
  // Site order: palettes are unshifted, so palettes[0] is the newest. We take them in display order.
  for (const p of state.palettes) {
    if (p.lock) {
      lockHex(lums, p.hex, lockedIdx);
      lockedHexes.add(p.hex);
    }
  }
  const lumsValues = lums.map((l) => l.lum);
  const colors: Record<string, any> = {};
  colors.grayscale = {
    name: 'grayscale',
    swatches: Object.fromEntries(
      lums.map((l, i) => [
        i,
        {
          lum: l.lum,
          rgb: l.rgb,
          hex: Color.RGBToHex(l.rgb[0], l.rgb[1], l.rgb[2]),
          hsl: Object.values(Color.RGBToHSL(l.rgb[0], l.rgb[1], l.rgb[2])),
          oklch: Object.values(Color.RGBToOKLCH(l.rgb[0], l.rgb[1], l.rgb[2])),
          label: l.label,
        },
      ]),
    ),
  };
  for (const p of state.palettes) {
    const filters = { hue: p.hue ?? 0, sat: p.sat ?? 0 };
    const gen = generateSwatches(p.hex, lums, filters);
    let name = p.name;
    if (!name) {
      const closestToMid = Color.closestLum(lumsValues, 50);
      const [midIndex] = Object.keys(closestToMid);
      const sw = gen.swatches[Number(midIndex)];
      const { h, s, l } = Color.RGBToHSL(sw.rgb[0], sw.rgb[1], sw.rgb[2]);
      name = Color.colorName(h, s, l) as string;
    }
    if (name === 'grayscale') name += '-alt';
    colors[name] = { name, hex: p.hex, filters, swatches: Object.fromEntries(gen.swatches.map((s, i) => [i, s])) };
  }
  return { colors, lums, lockedHexes };
}

// App.vue updateUrl: vue-router query encoding of the share link.
function encodeQ(str: string) {
  return encodeURIComponent(str)
    .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16))
    .replace(/%2C/g, ',');
}
export function shareUrl(state: State, lumsOverride?: number[]) {
  const lumsValues = lumsOverride ?? state.lums;
  const q: [string, string][] = [
    ['lums', lumsValues.map((v) => v.toFixed(2)).join(',')],
    ['palettes', state.palettes.map((p) => p.hex).join(',')],
    ['filters', state.palettes.map((p) => `${p.hue ?? 0}|${p.sat ?? 0}`).join(',')],
    ['names', state.palettes.map((p) => p.name ?? '').join(',')],
    // palette.label is never set by the UI, so the site writes one empty slot per palette.
    ['labels', state.palettes.map(() => '').join(',')],
  ];
  return `${SITE_URL}/app?` + q.map(([k, v]) => `${encodeQ(k)}=${encodeQ(v)}`).join('&');
}

// App.vue created(): read a share link back into state.
export function parseShareUrl(url: string): State {
  const u = new URL(url);
  const get = (k: string) => u.searchParams.get(k) ?? '';
  const lums = get('lums').split(',').filter((v) => !!v).map(parseFloat);
  const bases = get('palettes').split(',').filter((v) => !!v);
  // Like the site, empty names are dropped before matching by index, so names can shift onto
  // earlier palettes when an earlier palette had no name.
  const names = get('names').split(',').filter((v) => !!v);
  const filters = get('filters').split(',').filter((v) => !!v);
  return {
    lums: lums.length ? lums : PRESETS.default.getValues(),
    palettes: bases.map((hex, i) => {
      const [hue = '0', sat = '0'] = (filters[i] ?? '').split('|');
      return { hex, name: names[i], hue: parseFloat(hue) || 0, sat: parseFloat(sat) || 0 };
    }),
  };
}

// App.vue suggestedColors: complementary, triadic and +-60deg hues at luminance 40.
export function suggestedColors(hex: string, exclude: string[] = []) {
  if (hex === '#000000') return [];
  const { r, g, b } = Color.hexToRGB(hex);
  const { h, s } = Color.RGBToHSL(r, g, b);
  const lum = 40;
  const at = (hh: number) => {
    const rgb = Color.HSLtoRGB(hh, s, Color.lightnessFromHSLum(hh, s, lum));
    return Color.RGBToHex(...(Object.values(rgb).map(Math.round) as [number, number, number]));
  };
  const complH = h > 179 ? h - 180 : h + 180;
  let tri1H = h + 120;
  if (tri1H > 359) tri1H -= 360;
  let tri2H = h - 120;
  if (tri2H < 0) tri2H += 360;
  let near1H = h + 60;
  if (near1H > 359) near1H -= 360;
  let near2H = h - 60;
  if (near2H < 0) near2H += 360;
  const out = [
    { role: 'analogous -60', hex: at(near2H) },
    { role: 'triadic -120', hex: at(tri2H) },
    { role: 'complementary', hex: at(complH) },
    { role: 'triadic +120', hex: at(tri1H) },
    { role: 'analogous +60', hex: at(near1H) },
  ];
  return out.filter((o) => exclude.indexOf(o.hex) === -1);
}
