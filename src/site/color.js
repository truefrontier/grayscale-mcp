// Vendored verbatim from truefrontier/grayscale.design resources/js/utils/color.js (PR #18: clean-room colorName).
// Do not edit: the MCP must match the site exactly. Re-copy when the site changes.
export function hexToRGB(hex) {
  let r = 0;
  let g = 0;
  let b = 0;
  if (hex.length === 4) {
    r = `0x${hex[1]}${hex[1]}`;
    g = `0x${hex[2]}${hex[2]}`;
    b = `0x${hex[3]}${hex[3]}`;
  } else if (hex.length === 7) {
    r = `0x${hex[1]}${hex[2]}`;
    g = `0x${hex[3]}${hex[4]}`;
    b = `0x${hex[5]}${hex[6]}`;
  }
  return { r, g, b };
}

function componentToHex(c) {
  var hex = c.toString(16).padStart(2, '0');
  return hex.length == 1 ? '0' + hex : hex;
}

export function RGBToHex(r, g, b) {
  return '#' + componentToHex(Math.round(r)) + componentToHex(Math.round(g)) + componentToHex(Math.round(b));
}

export function RGBToHSL(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const cmin = Math.min(r, g, b);
  const cmax = Math.max(r, g, b);
  const delta = cmax - cmin;
  let h = 0;
  let s = 0;
  let l = 0;

  if (delta === 0) h = 0;
  else if (cmax === r) h = ((g - b) / delta) % 6;
  else if (cmax === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;

  h = Math.round(h * 60);

  if (h < 0) h += 360;

  l = (cmax + cmin) / 2;
  s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  s = +(s * 100).toFixed(1);
  l = +(l * 100).toFixed(1);

  return { h, s, l };
}

export function lumFromRGB(r, g, b) {
  // Formula from WCAG 2.0
  let [R, G, B] = [Math.round(r), Math.round(g), Math.round(b)].map(function (c) {
    c /= 255; // to 0-1 range
    return c < 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 21.26 * R + 71.52 * G + 7.22 * B;
}

export function RGBFromLum(lum, h = 180, s = 50) {
  // Adjust the lightness to match the grayscale luminance
  const newL = lightnessFromHSLum(h, s, lum);

  // Convert the adjusted HSL back to RGB
  const { r: newR, g: newG, b: newB } = HSLtoRGB(h, s, newL);

  return { r: newR, g: newG, b: newB };
}

export function closestLum(lums, lum) {
  let min = 100;
  let cLum = null;
  let cIndex = null;
  for (var i = lums.length - 1; i >= 0; i--) {
    let val = Math.abs(lums[i] - lum);
    if (val < min) {
      min = val;
      cLum = lums[i];
      cIndex = i;
    }
  }
  let closest = {};
  closest[cIndex] = cLum;
  return closest;
}

export function lightnessFromHSLum(h, s, lum) {
  let lowestDiff = 100;
  let newL = 100;

  // ballpark
  for (var l = 100; l >= 0; l--) {
    let curLum = lumFromRGB(...Object.values(HSLtoRGB(h, s, l)));
    let diff = Math.abs(lum - curLum);
    if (diff < lowestDiff) {
      newL = l;
      lowestDiff = diff;
    }
  }

  // fine-tune
  for (var l = newL + 5; l >= newL - 5; l -= 0.01) {
    let curLum = lumFromRGB(...Object.values(HSLtoRGB(h, s, l)));
    let diff = Math.abs(lum - curLum);
    if (diff < lowestDiff) {
      newL = l;
      lowestDiff = diff;
    }
  }

  return newL;
}

export function HSLtoRGB(h, s, l) {
  s /= 100;
  l /= 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (h >= 0 && h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (h >= 60 && h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (h >= 120 && h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (h >= 180 && h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (h >= 240 && h < 300) {
    r = x;
    g = 0;
    b = c;
  } else if (h >= 300 && h < 360) {
    r = c;
    g = 0;
    b = x;
  }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

// False color grayscale
export function falseColorGrayscale(r, g, b) {
  // Convert RGB to HSL
  const { h, s, l } = RGBToHSL(r, g, b);

  // Get the luminance of the original RGB color
  const lum = lumFromRGB(r, g, b);

  // Adjust the lightness to match the grayscale luminance
  const newL = lightnessFromHSLum(h, s, lum);

  // Convert the adjusted HSL back to RGB
  const { r: newR, g: newG, b: newB } = HSLtoRGB(h, s, newL);

  return { r: newR, g: newG, b: newB };
}

function grayscaleToFalseColor(grayscale, hue, saturation) {
  // Convert grayscale to RGB, which in grayscale is just the same value for R, G, and B
  let r = grayscale, g = grayscale, b = grayscale;

  // Calculate the luminance of this grayscale value
  let targetLuminance = lumFromRGB(r, g, b);

  // Use a binary search or iterative approach to find the closest lightness in HSL space
  let bestL = 0, minDiff = Infinity;
  for (let l = 0; l <= 100; l += 0.1) {
    let { r: lr, g: lg, b: lb } = HSLtoRGB(hue, saturation, l);
    let lum = lumFromRGB(lr, lg, lb);
    let diff = Math.abs(lum - targetLuminance);
    if (diff < minDiff) {
      minDiff = diff;
      bestL = l;
    }
  }

  return HSLtoRGB(hue, saturation, bestL);
}

export function generateFalseColorGrayscale(r, g, b, desiredHue, desiredSaturation) {
  // Get the false color grayscale
  const falseColorGrayscale = falseColorGrayscale(r, g, b);

  // Convert the false color grayscale to a false color
  const falseColor = grayscaleToFalseColor(
    (falseColorGrayscale.r + falseColorGrayscale.g + falseColorGrayscale.b) / 3,
    desiredHue,
    desiredSaturation
  );

  return {
    falseColorGrayscale,
    falseColor
  };
}

// Names a color from its HSL values with one of 12 basic color words.
// Fresh clean-room implementation (2026), written only from a behavioral spec of the earlier
// function; see https://github.com/truefrontier/grayscale-mcp/blob/main/docs/colorName-spec.md
const HUE_FAMILIES = [
  [346, 'red'],
  [291, 'pink'],
  [261, 'purple'],
  [191, 'blue'],
  [156, 'teal'],
  [55, 'green'],
  [16, 'warm'],
  [0, 'red'],
];

function familyForHue(hue, sat) {
  const family = HUE_FAMILIES.find(([start]) => hue >= start);
  if (!family) return undefined;
  if (family[1] !== 'warm') return family[1];
  if (sat < 90) return 'brown';
  return hue < 36 ? 'orange' : 'yellow';
}

export function colorName(hue, sat, light) {
  if (sat < 11) {
    if (light >= 90) return 'white';
    if (light < 71) return 'gray';
    const nearlyNeutral = sat >= 0 && sat < 1;
    return nearlyNeutral ? 'gray' : familyForHue(hue, sat);
  }
  if (light < 16) return 'black';
  return familyForHue(hue, sat);
}

/**
 * 
 */
function generateEvenlyDistributedPoints(count, xValue = 4, xDelta = 0.66) {
  const points = [];
  const interval = (2 * xValue) / (count - 1);
  for (let i = 0; i < count; i++) {
      const x = -xValue + i * interval;
      points.push(x);
  }
  
  const allPoints = [];
  points.forEach(point => {
      allPoints.push(point - xDelta);
      allPoints.push(point);
      allPoints.push(point + xDelta);
  });

  return { points, allPoints };
}


function solveForY(x) {
  return -0.011 * x ** 3 + 0.888 * x ** 2 + 10.267 * x + 27.629; // cubic-bezier(.5,0,1,1), xValue = 4, xDelta = 0.66
  // return 0.033 * x**3 + 1.096 * x**2 + 9.149 * x + 22.314; // cubic-bezier(.62,0,1,1), xValue = 4.225, xDelta = 0.49
}

function solveForX(targetY) {
  let x = -5;
  let deltaX = 0.01;
  let currentY = solveForY(x);
  while (x <= 5) {
      if (Math.abs(currentY - targetY) < 0.01) {
          return x;
      }
      x += deltaX;
      currentY = solveForY(x);
  }
  return null;
}

function calculateYValues(xValues, round = 2) {
    return xValues.map(x => Math.round(solveForY(x) * 10**round) / 10**round);
}
let xValues = generateEvenlyDistributedPoints(4);
let yValues = calculateYValues(xValues.allPoints);

// 92.93,82.2,72.05,50.99,42.87,35.4,20.76,15.54,11.04,3.5,1.47,0.23 // cubic-bezier(.5,0,1,1), xValue = 4, xDelta = 0.62
// 90.81,82.20,73.97,49.37,42.87,36.80,19.70,15.54,11.86,3.04,1.47,0.41 // cubic-bezier(.5,0,1,1), xValue = 4, xDelta = 0.5
// 93.49,83.02,73.31,43.99,37.46,31.55,14.88,11.51,08.62,1.74,0.73,0.07 // cubic-bezier(.62,0,1,1), xValue = 4.225, xDelta = 0.49

// Convert RGB to OKLCH (OKLAB with chroma and hue)
export function RGBToOKLCH(r, g, b) {
  // First convert RGB to linear RGB
  const linearR = gammaToLinear(r / 255);
  const linearG = gammaToLinear(g / 255);
  const linearB = gammaToLinear(b / 255);
  
  // Convert linear RGB to OKLAB
  const l = 0.4122214708 * linearR + 0.5363325363 * linearG + 0.0514459929 * linearB;
  const m = 0.2119034982 * linearR + 0.6806995451 * linearG + 0.1073969566 * linearB;
  const s = 0.0883024619 * linearR + 0.2817188376 * linearG + 0.6299787005 * linearB;
  
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  
  const okL = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
  const okA = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  const okB = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;
  
  // Convert OKLAB to OKLCH
  const okC = Math.sqrt(okA * okA + okB * okB);
  let okH = Math.atan2(okB, okA) * (180 / Math.PI);
  if (okH < 0) okH += 360;
  
  return {
    l: Math.round(okL * 10000) / 10000, // Lightness (0-1)
    c: Math.round(okC * 10000) / 10000, // Chroma (0+)
    h: Math.round(okH * 100) / 100      // Hue (0-360 degrees)
  };
}

function gammaToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}