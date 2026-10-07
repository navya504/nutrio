import type { foods, recipes } from "./catalog";
import type { MemberPlan, PlanEntry } from "@workspace/db";

export type NutritionCatalogue = { foods: typeof foods; recipes: typeof recipes };

export function catalogueItem(entry: Pick<PlanEntry, "kind" | "slug">, catalogue: NutritionCatalogue) {
  const { foods, recipes } = catalogue;
  return entry.kind === "food"
    ? foods.find((food) => food.slug === entry.slug)
    : recipes.find((recipe) => recipe.slug === entry.slug);
}

export function nutritionTotals(entries: PlanEntry[], catalogue: NutritionCatalogue) {
  const totals = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0, costInRupees: 0 };
  for (const entry of entries) {
    const item = catalogueItem(entry, catalogue);
    if (!item) throw new Error("Saved plan references a missing catalogue item");
    for (const key of ["calories", "proteinG", "carbsG", "fatG", "fiberG"] as const) {
      totals[key] += item[key] * entry.servings;
    }
    totals.costInRupees += ("priceInRupees" in item ? item.priceInRupees : item.costInRupees) * entry.servings;
  }
  return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, Math.round(value * 100) / 100]));
}

export function serializePlan(plan: MemberPlan, catalogue: NutritionCatalogue) {
  return {
    id: plan.id, name: plan.name, days: plan.days, entries: plan.entries,
    updatedAt: plan.updatedAt.toISOString(),
    totals: nutritionTotals(plan.entries, catalogue),
    dailyTotals: Array.from({ length: plan.days }, (_, day) => nutritionTotals(plan.entries.filter((entry) => entry.day === day), catalogue)),
  };
}
