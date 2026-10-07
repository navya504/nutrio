import type { Food, Recipe } from '@workspace/api-client-react';

export type Item = Food | Recipe;

export const GOALS = [
  { id: 'lose', label: 'Lose Weight', hint: 'Lighter, fibre-rich, filling' },
  { id: 'muscle', label: 'Build Muscle', hint: 'Protein-forward picks' },
  { id: 'energy', label: 'Eat for Energy', hint: 'Steady carbs and fibre' },
  { id: 'healthy', label: 'Eat Healthy', hint: 'Balanced, whole-food choices' },
  { id: 'workout', label: 'Pre/Post Workout', hint: 'Fuel up or recover' },
  { id: 'office', label: 'Healthy Office Food', hint: 'Quick, desk-friendly' },
];

export const priceOf = (item: Item) => ('priceInRupees' in item ? item.priceInRupees : item.costInRupees);
const textOf = (item: Item) =>
  `${item.name} ${item.category} ${item.tags.join(' ')} ${'bestFor' in item ? item.bestFor.join(' ') : ''}`.toLowerCase();

export function matchesGoal(goal: string, item: Item): boolean {
  const t = textOf(item);
  switch (goal) {
    case 'lose':
      return (item.calories <= 400 && (item.proteinG >= 10 || item.fiberG >= 4)) || /weight|fat loss|low.?cal|light/.test(t);
    case 'muscle':
      return item.proteinG >= 20 || /muscle|high.?protein/.test(t);
    case 'energy':
      return item.carbsG >= 40 || /energy|breakfast|oats|millet/.test(t);
    case 'healthy':
      return (item.fiberG >= 5 && item.calories <= 600) || /healthy|balanced|wholesome|fibre|fiber/.test(t);
    case 'workout':
      return /pre.?workout|post.?workout|workout|gym|recovery|training/.test(t) || (item.proteinG >= 18 && item.carbsG >= 25);
    case 'office':
      return item.prepMinutes <= 15 || /office|desk|lunch|portable|quick|on.?the.?go/.test(t);
    default:
      return true;
  }
}

export type Filters = {
  search: string;
  category: string;
  maxCalories: number | null;
  minProtein: number | null;
  diet: 'any' | 'veg' | 'vegan' | 'nonveg';
  maxBudget: number | null;
  maxPrep: number | null;
};

export const emptyFilters: Filters = { search: '', category: 'All', maxCalories: null, minProtein: null, diet: 'any', maxBudget: null, maxPrep: null };

/** Turns phrases like "under 300 calories" or "high protein" into numeric constraints. */
export function parseSmartSearch(raw: string) {
  let q = ` ${raw.toLowerCase()} `;
  const c: Partial<Filters> = {};
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    const m = q.match(re);
    if (m) { fn(m); q = q.replace(re, ' '); }
  };
  take(/\b(?:under|below|less than|max|upto|up to|<)\s*(\d+)\s*(?:kcal|cal|calories)\b/, (m) => { c.maxCalories = Number(m[1]); });
  take(/\b(\d+)\s*(?:kcal|calories)\s*(?:or less|max)\b/, (m) => { c.maxCalories = Number(m[1]); });
  take(/\b(?:over|above|at least|min|more than|>)\s*(\d+)\s*g?\s*(?:of\s*)?protein\b/, (m) => { c.minProtein = Number(m[1]); });
  take(/\b(?:high|rich in|good source of)[\s-]*protein\b/, () => { c.minProtein = Math.max(c.minProtein ?? 0, 20); });
  take(/\blow[\s-]*cal(?:orie)?s?\b/, () => { c.maxCalories = Math.min(c.maxCalories ?? 9999, 350); });
  take(/\b(?:under|below|less than|max|upto|up to|<)\s*(?:₹|rs\.?|inr)?\s*(\d+)\s*(?:₹|rs|rupees)?\b(?!\s*(?:min|minutes|kcal|cal))/, (m) => { c.maxBudget = Number(m[1]); });
  take(/\b(?:under|below|within|in|less than)\s*(\d+)\s*(?:min|mins|minutes)\b/, (m) => { c.maxPrep = Number(m[1]); });
  take(/\bquick\b/, () => { c.maxPrep = Math.min(c.maxPrep ?? 999, 15); });
  take(/\b(?:non[\s-]*veg(?:etarian)?)\b/, () => { c.diet = 'nonveg'; });
  take(/\b(?:vegetarian|veg)\b/, () => { c.diet = 'veg'; });
  take(/\bvegan\b/, () => { c.diet = 'vegan'; });
  const terms = q.replace(/\b(food|foods|meals?|with|and|for|a|the)\b/g, ' ').split(/\s+/).filter(Boolean);
  return { constraints: c, terms };
}

export function applyFilters<T extends Item>(items: T[], f: Filters): T[] {
  const { constraints, terms } = parseSmartSearch(f.search);
  const maxCalories = Math.min(f.maxCalories ?? Infinity, constraints.maxCalories ?? Infinity);
  const minProtein = Math.max(f.minProtein ?? 0, constraints.minProtein ?? 0);
  const maxBudget = Math.min(f.maxBudget ?? Infinity, constraints.maxBudget ?? Infinity);
  const maxPrep = Math.min(f.maxPrep ?? Infinity, constraints.maxPrep ?? Infinity);
  const diet = f.diet !== 'any' ? f.diet : constraints.diet ?? 'any';
  return items.filter((item) => {
    if (f.category !== 'All' && item.category !== f.category) return false;
    if (item.calories > maxCalories || item.proteinG < minProtein) return false;
    if (priceOf(item) > maxBudget || item.prepMinutes > maxPrep) return false;
    if (diet === 'veg' && !item.vegetarian) return false;
    if (diet === 'vegan' && !item.tags.some((tag) => tag.toLowerCase() === 'vegan')) return false;
    if (diet === 'nonveg' && item.vegetarian) return false;
    const hay = `${textOf(item)} ${item.description}`.toLowerCase();
    return terms.every((term) => hay.includes(term));
  });
}
