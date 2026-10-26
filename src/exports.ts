// Port of the export computeds in grayscale.design App.vue (cssTailwind, cssRadix, cssVars,
// cssScss, cssLess, cssStylus, autoDarkModeCss, autoDarkModeTailwindConfig) and
// app/Http/Controllers/ExportController.php (SVG). Output text matches the site's code boxes.
import * as Color from './site/color.js';
import { getValueLabel } from './palette.js';
import { LOGO } from './logo.js';

export type ColorType = 'rgb' | 'hex' | 'hsl' | 'oklch';
export const FORMATS = ['tailwind', 'radix', 'css-vars', 'scss', 'less', 'stylus', 'auto-dark-css', 'auto-dark-tailwind', 'svg', 'json'] as const;
export type Format = (typeof FORMATS)[number];

// App.vue formatSwatchColor
export function formatSwatchColor(swatch: any, cssType: ColorType) {
  if (cssType === 'hex') return swatch?.hex;
  if (cssType === 'rgb') return `rgb(${swatch.rgb?.join(', ')})`;
  if (cssType === 'hsl')
    return `hsl(${swatch.hsl[0]}, ${swatch.hsl[1] === 0 ? 0 : swatch.hsl[1].toFixed(2)}%, ${swatch.hsl[2].toFixed(2)}%)`;
  if (cssType === 'oklch')
    return `oklch(${swatch.oklch[0].toFixed(4)} ${swatch.oklch[1].toFixed(4)} ${swatch.oklch[2] === 0 ? 0 : swatch.oklch[2].toFixed(2)})`;
}

const keys = (o: object) => Object.keys(o);
const sorted = (o: object) => Object.keys(o).sort((a, b) => parseInt(a) - parseInt(b));

export function exportText(format: Format, colors: Record<string, any>, opts: { cssType: ColorType; url: string; lockedHexes: Set<string> }): string {
  const { cssType, url, lockedHexes } = opts;
  const fmt = (s: any) => formatSwatchColor(s, cssType);
  const label = (i: any, n: any) => getValueLabel(i, n);
  switch (format) {
    case 'tailwind': {
      const out: Record<string, any> = {};
      for (const name of keys(colors)) {
        out[name] = {};
        const n = keys(colors[name].swatches).length;
        keys(colors[name].swatches).forEach((i) => {
          const sw = colors[name].swatches[i];
          const l = label(i, n);
          out[name][l] = fmt(sw);
          if (lockedHexes.has(sw.hex)) out[name]['DEFAULT'] = out[name][l];
        });
      }
      return `// Grayscale Design palette: ${url}\nconst grayscale = ` + JSON.stringify(out, null, '  ');
    }
    case 'radix': {
      let js = `// Grayscale Design palette: ${url}\n`;
      try {
        js += keys(colors).reduce((str, name) => {
          str += `\nconst ${name} = {\n`;
          keys(colors[name].swatches).forEach((i) => {
            str += `  '${name}${parseInt(i, 10) + 1}': '${fmt(colors[name].swatches[i])}',\n`;
          });
          str += '};\n';
          str += `\nconst ${name}Dark = {\n`;
          keys(colors[name].swatches).forEach((i) => {
            const sw = colors[name].swatches[i];
            const lum = 100 - sw.lum;
            const [h, s] = sw.hsl;
            const l = Color.lightnessFromHSLum(h, s, lum);
            const { r, g, b } = Color.HSLtoRGB(sw.hsl[0], sw.hsl[1], l);
            const newSwatch = { lum, hex: Color.RGBToHex(r, g, b), rgb: [r, g, b].map(Math.round), hsl: [h, s, l], label: parseInt(i, 10) + 1 };
            str += `  '${name}${newSwatch.label}': '${fmt(newSwatch)}',\n`;
          });
          str += '};\n';
          return str;
        }, '');
      } catch (e) {
        // Same as the site: the Radix dark swatches carry no oklch value, so OKLCH output stops here.
      }
      return js;
    }
    case 'css-vars': {
      let css = `/* Grayscale Design palette: ${url} */\n:root {`;
      css += keys(colors).reduce((str, name) => {
        str += '\n';
        const n = keys(colors[name].swatches).length;
        keys(colors[name].swatches).forEach((i) => {
          str += `  --${name}-${label(i, n)}: ${fmt(colors[name].swatches[i])};\n`;
        });
        return str;
      }, '');
      return css + '}';
    }
    case 'scss':
    case 'less':
    case 'stylus': {
      let css = `// Grayscale Design palette: ${url}\n`;
      css += keys(colors).reduce((str, name) => {
        const n = keys(colors[name].swatches).length;
        keys(colors[name].swatches).forEach((i) => {
          const sw = colors[name].swatches[i];
          if (format === 'scss') str += `$${name}-${label(i, n)}: ${fmt(sw)};\n`;
          if (format === 'less') str += `@${name}-${label(i, n)}: ${fmt(sw)};\n`;
          // The site passes `swatchCount >= 10` (a boolean) as the count here, so Stylus labels run 100, 200, ...
          if (format === 'stylus') str += `${name}-${label(i, n >= 10)} = ${fmt(sw)}\n`;
        });
        return str + '\n';
      }, '');
      return css;
    }
    case 'auto-dark-css':
      return autoDarkCss(colors, url);
    case 'auto-dark-tailwind':
      return autoDarkConfig(colors);
    case 'svg':
      return svg(colors);
    case 'json':
      return JSON.stringify(colors, null, 2);
  }
}

function autoDarkCss(colors: Record<string, any>, url: string) {
  const label = (i: any, n: any) => getValueLabel(i, n);
  let css = `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n@layer utilities {\n`;
  css += `  /* Grayscale Design palette: ${url} */\n`;
  css += `  :root {\n`;
  css += keys(colors).reduce((str, name) => {
    str += `\n`;
    const n = keys(colors[name].swatches).length;
    keys(colors[name].swatches).forEach((i) => {
      const value = colors[name].swatches[i].rgb?.join(' ');
      if (value) str += `    --${name}-${label(i, n)}: ${value};\n`;
    });
    return str;
  }, '');
  css += `\n    --black: 0 0 0;\n`;
  css += `    --white: 255 255 255;\n\n`;
  const g = colors.grayscale?.swatches;
  if (g) {
    css += `    /* Set abstract colors */\n`;
    css += `    --dark: var(--black);\n`;
    css += `    --light: var(--white);\n\n`;
    const ks = sorted(g);
    ks.forEach((i) => {
      css += `    --neutral-${label(i, ks.length)}: var(--grayscale-${label(i, ks.length)});\n`;
    });
  }
  css += `  }\n\n`;
  css += `  @media (prefers-color-scheme: dark) {\n`;
  css += `    /* Flip the values for dark mode */\n`;
  css += `    :root {\n`;
  css += `      --dark: var(--white);\n`;
  css += `      --light: var(--black);\n\n`;
  if (g) {
    const ks = sorted(g);
    const n = ks.length;
    ks.forEach((i) => {
      css += `      --neutral-${label(i, n)}: var(--grayscale-${label(n - 1 - parseInt(i), n)});\n`;
    });
  }
  keys(colors).forEach((name) => {
    if (name !== 'grayscale') {
      css += `\n`;
      const n = keys(colors[name].swatches).length;
      sorted(colors[name].swatches).forEach((i) => {
        css += `      --${name}-${label(i, n)}: var(--${name}-${label(n - 1 - parseInt(i), n)});\n`;
      });
    }
  });
  css += `    }\n\n`;
  css += `\n    /* with this utility class you can do something like <div class="text-primary-400 dark:unset-dark-mode"> and it (and all it's child elements) will not automatically switch in darkmode. */\n`;
  css += `    .unset-dark-mode {\n`;
  css += keys(colors).reduce((str, name) => {
    const n = keys(colors[name].swatches).length;
    keys(colors[name].swatches).forEach((i) => {
      str += `      --${name}-${label(i, n)}: var(--${name}-${label(i, n)});\n`;
    });
    return str + `\n`;
  }, '');
  if (g) {
    const ks = sorted(g);
    ks.forEach((i) => {
      css += `      --neutral-${label(i, ks.length)}: var(--grayscale-${label(i, ks.length)});\n`;
    });
  }
  css += `    }\n`;
  css += `  }\n`;
  css += `}`;
  return css;
}

function autoDarkConfig(colors: Record<string, any>) {
  let config = `function setAsCssVariable(colorName) {\n`;
  config += `  let augmentedPalette = {};\n`;
  config += `  const values = [`;
  if (colors.grayscale?.swatches) {
    const ks = sorted(colors.grayscale.swatches);
    config += ks.map((i) => getValueLabel(i, ks.length)).join(', ');
  } else {
    config += '50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100';
  }
  config += `];\n`;
  config += `  values.forEach((value) => {\n`;
  config += `    augmentedPalette[value] = \`rgb(var(--\${colorName}-\${value}) / <alpha-value>)\`;\n`;
  config += `  });\n`;
  config += `  return augmentedPalette;\n`;
  config += `}\n\n`;
  config += `module.exports = {\n`;
  config += `  theme: {\n`;
  config += `    colors: {\n`;
  config += `      current: 'currentColor',\n`;
  config += `      transparent: 'transparent',\n`;
  config += `      black: 'rgb(var(--black) / <alpha-value>)',\n`;
  config += `      white: 'rgb(var(--white) / <alpha-value>)',\n`;
  config += `      light: 'rgb(var(--light) / <alpha-value>)',\n`;
  config += `      dark: 'rgb(var(--dark) / <alpha-value>)',\n`;
  keys(colors).forEach((name) => {
    config += `      ${name}: setAsCssVariable('${name}'),\n`;
  });
  config += `      neutral: setAsCssVariable('neutral'),\n`;
  config += `    },\n`;
  config += `  },\n`;
  config += `};\n`;
  return config;
}

// PHP round() + float-to-string (precision 14) for the values the SVG prints.
function phpRound(x: number, p = 0) {
  const m = Math.pow(10, p);
  const v = Math.abs(x) * m;
  const pre = parseFloat(v.toPrecision(15));
  return (Math.sign(x) * Math.round(pre)) / m;
}
function phpStr(x: number) {
  const s = String(parseFloat(x.toPrecision(14)));
  return s === '-0' ? '-0' : s;
}

// ExportController@svgs. The site POSTs JSON.stringify(cssColors) to /export-svgs; we render the same SVG locally.
function svg(colors: Record<string, any>) {
  // The site sends the colors through JSON, so mirror that round trip.
  const data = JSON.parse(JSON.stringify(colors));
  let i = 0;
  let j = 0;
  let file = '';
  const swatchW = 60, swatchH = 60, topPadding = 60, leftPadding = 50;
  const t = (x: number, y: number, style: string, text: string) => `<text transform="translate(${phpStr(x)} ${phpStr(y)})" style="${style}">${text}</text>`;
  const LBL = 'font-size: 5px;fill: #b4bed5;font-family: Courier, monospace;font-weight: 700';
  const VAL = 'font-size: 5px;fill: #231f20;font-family: Courier, monospace';
  for (const name of Object.keys(data)) {
    const color = data[name];
    const y = i * (swatchH + 50 + topPadding) + topPadding;
    file += t(leftPadding, y - 10, 'font-size: 12px;fill: #232834;font-family: Courier, monospace;font-weight: 700', name);
    ['hex', 'rgb', 'hsl', 'lum', 'val'].forEach((k, n) => (file += t(leftPadding - 20, y + swatchH + 10 * (n + 1), LBL, `${k}:`)));
    j = 0;
    const swatchKeys = Object.keys(color.swatches);
    for (const index of swatchKeys) {
      const sw = color.swatches[index];
      const idx = parseInt(index, 10);
      const swatchCount = swatchKeys.length;
      const lbl = swatchCount >= 10 ? (idx == 0 ? '50' : idx + '00') : idx + 1 + '00';
      const x = j * swatchW + leftPadding;
      file += `<rect id="${name}-${idx + 1}00" x="${x}" y="${y}" width="${swatchW}" height="${swatchH}" style="fill: ${sw.hex}" />`;
      file += t(x, y + swatchH + 10, VAL, sw.hex);
      file += t(x, y + swatchH + 20, VAL, sw.rgb.map((v: number) => phpStr(v)).join(', '));
      file += t(x, y + swatchH + 30, VAL, `${phpStr(phpRound(sw.hsl[0]))}, ${phpStr(phpRound(sw.hsl[1], 1))}%, ${phpStr(phpRound(sw.hsl[2], 1))}%`);
      file += t(x, y + swatchH + 40, VAL, `${phpStr(phpRound(sw.lum, 2))}%`);
      file += t(x, y + swatchH + 50, VAL, lbl);
      j++;
    }
    i++;
  }
  const w = leftPadding * 2 + j * swatchW;
  const h = topPadding + i * (swatchH + 100);
  file = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` + file;
  file += `<image id="logo" width="322" height="63" transform="translate(${phpStr(w - (322 / 3 + 20))} 20) scale(0.33)" xlink:href="data:image/png;base64,${LOGO}"/>`;
  file += '</svg>';
  return file;
}
