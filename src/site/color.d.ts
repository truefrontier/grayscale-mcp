// Types for the vendored site module (color.js).
export function hexToRGB(hex: string): { r: any; g: any; b: any };
export function RGBToHex(r: number, g: number, b: number): string;
export function RGBToHSL(r: any, g: any, b: any): { h: number; s: number; l: number };
export function lumFromRGB(r: any, g: any, b: any): number;
export function RGBFromLum(lum: number, h?: number, s?: number): { r: number; g: number; b: number };
export function closestLum(lums: number[], lum: number): Record<string, number>;
export function lightnessFromHSLum(h: number, s: number, lum: number): number;
export function HSLtoRGB(h: number, s: number, l: number): { r: number; g: number; b: number };
export function colorName(h: number, s: number, l: number): string | undefined;
export function RGBToOKLCH(r: number, g: number, b: number): { l: number; c: number; h: number };
