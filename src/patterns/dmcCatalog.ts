import type { DmcRef } from '../engine/types';

/**
 * DMC floss catalog used by the editor color-replace picker.
 *
 * Entries are harvested from the source .oxs charts in `resources/` (the
 * cross-stitch files the Tirazain archive ships), so every hex here matches a
 * colour that real patterns actually suggest. number/name/hex come straight
 * from the OXS `palette_item` rows. This is factual thread reference data, not
 * a third-party table — it is the DMC universe of our own library.
 */
export interface DmcCatalogEntry extends DmcRef {
  hex: string;
}

export const DMC_CATALOG: readonly DmcCatalogEntry[] = [
  { number: "11", name: "Light Tender Green", hex: "#E0DC84" },
  { number: "21", name: "Light Alizarin", hex: "#C0614D" },
  { number: "33", name: "Fuchsia", hex: "#884B8E" },
  { number: "34", name: "Dark Fuchsia", hex: "#7A3070" },
  { number: "35", name: "Very Dark Fuchsia", hex: "#58274B" },
  { number: "155", name: "Blue Violet medium dk", hex: "#7665AB" },
  { number: "165", name: "Moss Green very light", hex: "#CDC965" },
  { number: "208", name: "Lavender very dark", hex: "#824596" },
  { number: "209", name: "Lavender dark", hex: "#A66CB3" },
  { number: "210", name: "Lavender medium", hex: "#BE91CD" },
  { number: "301", name: "Mahogany medium", hex: "#994725" },
  { number: "304", name: "Christmas Red medium", hex: "#9A0029" },
  { number: "307", name: "Lemon", hex: "#FBDE18" },
  { number: "310", name: "Black", hex: "#0C0C0C" },
  { number: "311", name: "Navy Med", hex: "#1A2336" },
  { number: "312", name: "Navy LT", hex: "#2F3F5A" },
  { number: "340", name: "Blue Violet medium", hex: "#7C76BE" },
  { number: "350", name: "Coral medium", hex: "#D43434" },
  { number: "435", name: "Brown very light", hex: "#A36134" },
  { number: "436", name: "Tan", hex: "#B97C4A" },
  { number: "444", name: "Lemon DK", hex: "#DAA60B" },
  { number: "445", name: "Lemon LT", hex: "#FFF47E" },
  { number: "452", name: "Shell Grey Med", hex: "#917B79" },
  { number: "453", name: "Shell Grey LT", hex: "#C2AAA6" },
  { number: "471", name: "Avocado Green very lt", hex: "#8D9D54" },
  { number: "498", name: "Christmas Red dark", hex: "#880025" },
  { number: "519", name: "Sky Blue", hex: "#78B1C8" },
  { number: "563", name: "Jade LT", hex: "#84B58E" },
  { number: "564", name: "Jade VY LT", hex: "#C5FFD0" },
  { number: "597", name: "Turquoise", hex: "#4D929F" },
  { number: "602", name: "Cranberry medium", hex: "#D7306D" },
  { number: "603", name: "Pink Mauve Med", hex: "#E04B91" },
  { number: "604", name: "Pink Mauve LT", hex: "#EB80B3" },
  { number: "608", name: "Burnt Orange", hex: "#FF4225" },
  { number: "676", name: "Old Gold light", hex: "#E6B469" },
  { number: "727", name: "Topaz very light", hex: "#FFE471" },
  { number: "738", name: "Tan very light", hex: "#D5A978" },
  { number: "740", name: "Tangerine (971)", hex: "#FF6C1B" },
  { number: "743", name: "Yellow medium", hex: "#FFC847" },
  { number: "797", name: "Royal Blue", hex: "#293A7C" },
  { number: "817", name: "Coral Red very dark", hex: "#A60D1B" },
  { number: "824", name: "Blue very dark", hex: "#1B3E71" },
  { number: "832", name: "Gold Med", hex: "#916C20" },
  { number: "833", name: "Gold LT", hex: "#AB822E" },
  { number: "900", name: "Burnt Orange dark", hex: "#C63423" },
  { number: "907", name: "Parrot Green light", hex: "#87A623" },
  { number: "913", name: "Nile Green medium", hex: "#4DAF78" },
  { number: "921", name: "Copper", hex: "#BC4D2E" },
  { number: "922", name: "Copper light", hex: "#D7633A" },
  { number: "931", name: "Antique Blue Med", hex: "#4D535E" },
  { number: "932", name: "Antique Blue LT", hex: "#79818D" },
  { number: "951", name: "Tawny light", hex: "#F7CEA9" },
  { number: "975", name: "Golden Brown DK", hex: "#662600" },
  { number: "976", name: "Golden Brown Med", hex: "#C16420" },
  { number: "977", name: "Golden Brown LT", hex: "#EB8134" },
  { number: "992", name: "Leaf Green Med", hex: "#498A6E" },
  { number: "993", name: "Leaf Green LT", hex: "#6AA18A" },
  { number: "996", name: "Electric Blue medium", hex: "#0097E1" },
  { number: "3052", name: "Green Grey Med", hex: "#53563A" },
  { number: "3053", name: "Green Grey LT", hex: "#73754F" },
  { number: "3326", name: "Baby Pink", hex: "#F28497" },
  { number: "3346", name: "Hunter Green Med", hex: "#556E30" },
  { number: "3347", name: "Yellow Green Med", hex: "#7A994D" },
  { number: "3348", name: "Yellow Green LT", hex: "#B9DF83" },
  { number: "3727", name: "Antique Mauve LT", hex: "#B67E95" },
  { number: "3731", name: "Dusty Rose DK", hex: "#9E3D50" },
  { number: "3743", name: "Antique Violet VY LT", hex: "#BFA2B6" },
  { number: "3747", name: "Blue Violet VY LT", hex: "#B9BEF9" },
  { number: "3770", name: "Flesh Ultra VY LT", hex: "#FBDAC2" },
  { number: "3772", name: "Flesh VY DK", hex: "#844936" },
  { number: "3773", name: "Flesh Med", hex: "#B17460" },
  { number: "3787", name: "Brown Grey", hex: "#3C3328" },
  { number: "3799", name: "Pewter Grey VY DK", hex: "#1D1D1E" },
  { number: "3801", name: "Christmas Red LT", hex: "#D21D22" },
  { number: "3803", name: "Plum DK", hex: "#601229" },
  { number: "3805", name: "Cyclamen Pink", hex: "#CC2B73" },
  { number: "3837", name: "Lavender ultra dark", hex: "#6C3681" },
  { number: "3838", name: "Lavender Blue DK", hex: "#5977A6" },
  { number: "3839", name: "Lavender Blue MD", hex: "#7E83B9" },
  { number: "3840", name: "Lavender Blue LT", hex: "#BDC7D7" },
  { number: "3847", name: "Teal Green DK", hex: "#006059" },
  { number: "3848", name: "Teal Green MD", hex: "#007872" },
  { number: "3854", name: "Autumn Gold MD", hex: "#F89C00" },
  { number: "3855", name: "Autumn Gold LT", hex: "#FFD781" },
  { number: "3856", name: "Mahogany ultra very", hex: "#E5A472" },
  { number: "3857", name: "Rosewood DK", hex: "#7E1703" },
  { number: "3858", name: "Rosewood MD", hex: "#8A210D" },
  { number: "3859", name: "Rosewood LT", hex: "#C77467" },
  { number: "3861", name: "Cocoa Brown LT", hex: "#C08E8B" },
  { number: "3862", name: "Mocha Beige DK", hex: "#744217" },
  { number: "3864", name: "Mocha Beige LT", hex: "#CD9C84" },
  { number: "5200", name: "White Bright (B5200)", hex: "#FFFFFF" },
  { number: "ECRU", name: "Ecru", hex: "#EDDEC4" },
];

/** Fast lookup by DMC number (e.g. "310", "ECRU"). */
export const DMC_BY_NUMBER: ReadonlyMap<string, DmcCatalogEntry> = new Map(
  DMC_CATALOG.map((e) => [e.number, e]),
);

/**
 * The set of DMC numbers actually used across a collection of patterns —
 * the "traditional Palestinian palette" the user can filter the picker to.
 * Pass the patterns whose palettes should count (built-ins + archive).
 */
export function libraryDmcNumbers(
  patterns: Iterable<{ palette?: unknown }>,
): Set<string> {
  const used = new Set<string>();
  for (const p of patterns) {
    const pal = p.palette;
    if (!Array.isArray(pal)) continue;
    for (const entry of pal) {
      if (entry && typeof entry === 'object' && entry.dmc?.number) {
        used.add(entry.dmc.number);
      }
    }
  }
  return used;
}
