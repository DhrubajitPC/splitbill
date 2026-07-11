/** Ground truth from the Kanpai 2.0 receipt photo.
 *  Name matchers allow OCR typos (Biack/Black, missing HH prefix, etc.).
 */
export const KANPAI_EXPECTED = [
  { name: /asahi\s*pint/i, price: 11 },
  { name: /sapporo\s*b[li]ack\s*pint/i, price: 11 },
  { name: /sapporo\s*tower/i, price: 58 },
  { name: /pellegrino/i, price: 15 },
  { name: /gyoza\s*cheese/i, price: 12 },
  { name: /asahi/i, price: 6 }, // OCR often drops "6PM HH" on this line
  { name: /k\.?\s*bl?ianc/i, price: 12 },
  { name: /6\s*pm\s*hh\s*sapporo$/i, price: 6 },
  { name: /7\s*pm\s*hh\s*sapporo$/i, price: 7 },
  { name: /7\s*pm\s*hh\s*sapporo\s*b[li]ack/i, price: 14 },
  { name: /tequila/i, price: 28 },
  { name: /asahi/i, price: 16 },
  { name: /chu-?\s*hi.*lychee|lychee.*8\s*pm/i, price: 8 },
  { name: /sapporo\s*plum/i, price: 6 },
  { name: /nachos/i, price: 19 },
  { name: /quesadilla/i, price: 19 },
  { name: /pork\s*be[li]{2}y/i, price: 18 },
  { name: /popcorn/i, price: 15 },
  { name: /thai\s*pork/i, price: 15 },
  { name: /truffle\s*fries/i, price: 14 },
] as const

export const KANPAI_TOTALS = {
  serviceCharge: 31,
  tax: 30.69,
  total: 371.69,
  itemsSubtotal: 310,
} as const
