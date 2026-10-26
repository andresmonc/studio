// Deterministic color assignment for flag variations. Colors are generated
// procedurally so every variation gets a visibly distinct, full-spectrum hue
// that never repeats — even for flags with many variations. Hues are spaced by
// the golden angle, which keeps successive indices as far apart on the color
// wheel as possible. Lightness/chroma are fixed constants tuned to read on both
// the light and dark card backgrounds (App.css --card).

// Golden angle (deg): maximizes hue separation between successive indices.
const GOLDEN_ANGLE = 137.508;
// Starting hue — teal-ish so variation 0 stays familiar with the app theme.
const BASE_HUE = 180;
// Fixed OKLCH lightness/chroma, legible on light (--card ≈ 0.968) and dark
// (--card ≈ 0.274) backgrounds alike.
const LIGHTNESS = 0.72;
const CHROMA = 0.17;

// Variation names that read as the "off"/negative side get a neutral color, so a
// boolean flag shows one accent segment and one muted segment.
const NEUTRAL_KEYS = new Set(["off", "false", "disabled", "no"]);

// variationColor returns a CSS color value for a variation, stable by its index
// within the flag's variation list.
export function variationColor(name: string, index: number): string {
  if (NEUTRAL_KEYS.has(name.trim().toLowerCase())) {
    return "var(--muted-foreground)";
  }
  const hue = (BASE_HUE + index * GOLDEN_ANGLE) % 360;
  return `oklch(${LIGHTNESS} ${CHROMA} ${hue})`;
}
