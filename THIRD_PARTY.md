# Third-party code and credits

`src/site/color.js` is an unedited copy of grayscale.design's `resources/js/utils/color.js`. Some of its formulas follow outside sources, credited here as a courtesy:

| Code | Source | License |
| --- | --- | --- |
| `RGBToOKLCH()` | Uses the linear sRGB → Oklab matrices from Björn Ottosson, "A perceptual color space for image processing", https://bottosson.github.io/posts/oklab/ | Public domain, or MIT at the user's choice, as stated by the author. Copyright (c) 2020 Björn Ottosson. |
| `lumFromRGB()`, `gammaToLinear()` | Relative-luminance and sRGB transfer formulas from WCAG 2.0 / IEC 61966-2-1 | Formulas from public specifications |
| `RGBToHSL()`, `HSLtoRGB()` | Closely follows Jon Kantner, "Converting Color Spaces in JavaScript", CSS-Tricks | CSS-Tricks license: code may be used freely, with or without credit (https://css-tricks.com/license/) |

`colorName()` is a fresh clean-room implementation written from a black-box behavioral spec ([docs/colorName-spec.md](docs/colorName-spec.md)). It contains no third-party code.
