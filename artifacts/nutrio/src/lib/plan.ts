import type { Food, MealEntry, NutritionTotals, Recipe } from '@workspace/api-client-react';
import { DISCLAIMER } from '@/lib/disclaimer';

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export const MEAL_LABEL: Record<string, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks' };
export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export type DraftEntry = MealEntry & { key: string };
export type Catalogue = { foods: Map<string, Food>; recipes: Map<string, Recipe> };

export type ItemInfo = { name: string; unit: string } & NutritionTotals;
export function itemInfo(cat: Catalogue, kind: string, slug: string): ItemInfo | undefined {
  if (kind === 'food') {
    const f = cat.foods.get(slug);
    return f && { name: f.name, unit: f.portion, calories: f.calories, proteinG: f.proteinG, carbsG: f.carbsG, fatG: f.fatG, fiberG: f.fiberG, costInRupees: f.priceInRupees };
  }
  const r = cat.recipes.get(slug);
  return r && { name: r.name, unit: 'serving', calories: r.calories, proteinG: r.proteinG, carbsG: r.carbsG, fatG: r.fatG, fiberG: r.fiberG, costInRupees: r.costInRupees };
}
export const zeroTotals = (): NutritionTotals => ({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0, costInRupees: 0 });
export function entryTotals(cat: Catalogue, e: MealEntry): NutritionTotals {
  const i = itemInfo(cat, e.kind, e.slug);
  if (!i) return zeroTotals();
  const s = e.servings;
  return { calories: i.calories * s, proteinG: i.proteinG * s, carbsG: i.carbsG * s, fatG: i.fatG * s, fiberG: i.fiberG * s, costInRupees: i.costInRupees * s };
}
export function sumEntries(cat: Catalogue, entries: MealEntry[]): NutritionTotals {
  const t = zeroTotals();
  for (const e of entries) { const x = entryTotals(cat, e); t.calories += x.calories; t.proteinG += x.proteinG; t.carbsG += x.carbsG; t.fatG += x.fatG; t.fiberG += x.fiberG; t.costInRupees += x.costInRupees; }
  const round = (n: number) => Math.round(n * 100) / 100;
  return { calories: round(t.calories), proteinG: round(t.proteinG), carbsG: round(t.carbsG), fatG: round(t.fatG), fiberG: round(t.fiberG), costInRupees: round(t.costInRupees) };
}
export const r1 = (n: number) => Math.round(n * 10) / 10;
export function dailyTotals(cat: Catalogue, entries: MealEntry[], days: number): NutritionTotals[] {
  return Array.from({ length: days }, (_, d) => sumEntries(cat, entries.filter((e) => e.day === d)));
}
export const dayLabel = (d: number, days: number) => (days === 1 ? 'Today' : DAY_NAMES[d]);

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const csvCell = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const nums = (t: NutritionTotals) => [t.calories, t.proteinG, t.carbsG, t.fatG, t.fiberG, t.costInRupees];

export function buildCsv(name: string, days: number, entries: MealEntry[], cat: Catalogue): string {
  const rows: (string | number)[][] = [[`Nutrio meal plan: ${name}`], [], ['Day', 'Meal', 'Item', 'Type', 'Servings', 'Calories (kcal)', 'Protein (g)', 'Carbs (g)', 'Fat (g)', 'Fibre (g)', 'Estimated cost (INR)']];
  for (let d = 0; d < days; d++) {
    for (const meal of MEALS) for (const e of entries.filter((x) => x.day === d && x.meal === meal)) {
      const t = entryTotals(cat, e);
      rows.push([dayLabel(d, days), MEAL_LABEL[meal], itemInfo(cat, e.kind, e.slug)?.name ?? e.slug, e.kind, e.servings, ...nums(t)]);
    }
    rows.push([dayLabel(d, days), 'Day total', '', '', '', ...nums(sumEntries(cat, entries.filter((x) => x.day === d)))]);
  }
  rows.push(['Overall', 'Plan total', '', '', '', ...nums(sumEntries(cat, entries))], [], [DISCLAIMER]);
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

export function buildHtml(name: string, days: number, entries: MealEntry[], cat: Catalogue): string {
  const th = '<tr><th>Meal</th><th>Item</th><th>Servings</th><th>kcal</th><th>Protein g</th><th>Carbs g</th><th>Fat g</th><th>Fibre g</th><th>Cost INR</th></tr>';
  const cells = (t: NutritionTotals) => nums(t).map((value) => `<td>${Math.round(value * 100) / 100}</td>`).join('');
  let body = '';
  for (let d = 0; d < days; d++) {
    const list = entries.filter((x) => x.day === d);
    let rows = '';
    for (const meal of MEALS) for (const e of list.filter((x) => x.meal === meal)) rows += `<tr><td>${MEAL_LABEL[meal]}</td><td>${esc(itemInfo(cat, e.kind, e.slug)?.name ?? e.slug)}</td><td>${e.servings}</td>${cells(entryTotals(cat, e))}</tr>`;
    if (!rows) rows = '<tr><td colspan="9"><em>Nothing planned</em></td></tr>';
    body += `<h2>${dayLabel(d, days)}</h2><table>${th}${rows}<tr class="tot"><td colspan="3">Day total</td>${cells(sumEntries(cat, list))}</tr></table>`;
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(name)} - Nutrio meal plan</title><style>body{font-family:Georgia,serif;background:#f6f4ec;color:#20352c;margin:0;padding:32px;max-width:900px;margin-inline:auto}h1{font-size:30px;margin:0}h2{margin:28px 0 8px;font-size:18px;color:#315f43}table{width:100%;border-collapse:collapse;font-size:13px;background:#fbfaf6}th,td{border:1px solid #d9ddcf;padding:6px 8px;text-align:left}th{background:#e9eddf}.tot td{font-weight:bold;background:#dce8c8}.brand{color:#79924c;font-weight:bold;letter-spacing:.1em;font-size:12px;text-transform:uppercase}p.d{margin-top:28px;font-size:11px;color:#5e715f}</style></head><body><div class="brand">nutrio meal plan</div><h1>${esc(name)}</h1><p>${days === 7 ? '7-day plan' : '1-day plan'}</p>${body}<h2>Overall</h2><table>${th.replace('<th>Meal</th><th>Item</th><th>Servings</th>', '<th colspan="3"></th>')}<tr class="tot"><td colspan="3">Plan total</td>${cells(sumEntries(cat, entries))}</tr></table><p class="d">${esc(DISCLAIMER)}</p></body></html>`;
}

export function downloadText(filename: string, mime: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'plan';
