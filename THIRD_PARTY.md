# Third-party code

`src/site/color.js` is an unedited copy of grayscale.design's `resources/js/utils/color.js`. Parts of it come from, or follow, outside sources:

| Code | Source | License |
| --- | --- | --- |
| `colorName()` | Adapted from the Stack Overflow answer by Patricio Bustos, https://stackoverflow.com/a/55600168 (cited in the code with `@see`). The site changed the hue bands (adds `teal`) and the order of the gray/black checks. | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), Stack Overflow's license for contributions after May 2018. Changes are described here. |
| `RGBToOKLCH()` | Uses the linear sRGB → Oklab matrices from Björn Ottosson, "A perceptual color space for image processing", https://bottosson.github.io/posts/oklab/ | Public domain, or MIT at the user's choice, as stated by the author. Copyright (c) 2020 Björn Ottosson. |
| `lumFromRGB()`, `gammaToLinear()` | Relative-luminance and sRGB transfer formulas from WCAG 2.0 / IEC 61966-2-1 | Formulas from public specifications |
| `RGBToHSL()`, `HSLtoRGB()` | Closely follows Jon Kantner, "Converting Color Spaces in JavaScript", CSS-Tricks | CSS-Tricks license: code may be used freely, with or without credit (https://css-tricks.com/license/) |
