/** Ground truth from Din Tai Fung MBLM Marina Bay receipt. */
export const DTF_EXPECTED = [
  { name: /chilli\s*crab|chili\s*crab|ocbc.*xlb|小笼包/i, price: 21.24 },
  { name: /sweet\s*sour\s*pork|咕咾肉/i, price: 18.9 },
  { name: /shredded\s*pork\s*fried\s*rice|肉丝蛋饭/i, price: 11.8 },
  { name: /cucumber|黄瓜/i, price: 6.3 },
  { name: /oriental\s*salad|小菜/i, price: 6 },
  { name: /shrimp\s*fried\s*rice|虾仁蛋饭/i, price: 15 },
  { name: /spinach|菠菜/i, price: 13 },
  { name: /strawberry|mochi|草莓/i, price: 15.8 },
  { name: /shrimp\s*dou\s*miao|豆苗/i, price: 18 },
  { name: /shrimp\s*sm|烧卖|siew\s*mai/i, price: 12.8 },
  { name: /jasmine\s*tea|茉莉/i, price: 8 },
  { name: /noodle|炸酱|bean/i, price: 11 },
  { name: /pork\s*chop|排骨蛋饭/i, price: 14.3 },
  { name: /wanton|wonton|馄饨/i, price: 9.8 },
] as const

export const DTF_TOTALS = {
  itemsSubtotal: 181.94,
  serviceCharge: 18.19,
  tax: 18.01,
  total: 218.14,
} as const
