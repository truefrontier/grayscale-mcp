# colorName(h, s, l): behavioral spec (black-box)

Written only from the observed outputs of the earlier function, using exhaustive black-box probes,
without reading its source or the Stack Overflow answer it cites.

## Inputs
- h: hue in degrees. In the app it comes from RGBToHSL, so it's an integer from 0 to 360.
- s: saturation, a percentage from 0 to 100 with one decimal place.
- l: lightness, a percentage from 0 to 100 with one decimal place.

## Output
One of 12 lowercase English color words:
black, white, gray, red, orange, yellow, brown, green, teal, blue, purple, pink.
For a hue below 0 (or NaN) in the chromatic branches it returns undefined.

## How the name is chosen (the first rule that applies wins)
1. **Low saturation (s < 11):**
   - l >= 90: "white"
   - l < 71: "gray"
   - 0 <= s < 1: "gray" (nearly neutral)
   - otherwise: a hue name (step 3). So a tinted pastel with 1 <= s < 11 and 71 <= l < 90 still gets its hue. Outside the real domain, a negative s, or a NaN l with s >= 1, also lands here.
2. **Dark (s >= 11 and l < 16):** "black"
3. **Hue name (everything else, including s >= 11 with l >= 90).** The hue picks a band; each band starts at the listed degree and runs up to the next one:

   | from h | name |
   |---|---|
   | 0 | red |
   | 16 | warm band (see below) |
   | 55 | green |
   | 156 | teal |
   | 191 | blue |
   | 261 | purple |
   | 291 | pink |
   | 346 | red (and any h above 360) |

   **Warm band (16 <= h < 55):**
   - s < 90: "brown"
   - s >= 90 and h < 36: "orange"
   - s >= 90 and h >= 36: "yellow"

   **Hue below 0 or NaN:** undefined.

## Boundaries (all checked at 0.001 resolution)
s=1, s=11 and s=90, l=16, l=71 and l=90, h=16, 36, 55, 156, 191, 261, 291 and 346.
Each lower bound is inclusive.

## Edge behavior observed (outside the app's real input domain)
- An undefined or NaN s or l never satisfies the low-saturation or dark tests, so the result falls through to a hue name.
- null h behaves like 0 (red). Numeric strings behave like numbers.
