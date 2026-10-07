import { test } from "node:test";
import assert from "node:assert/strict";
import { foods, recipes } from "./catalog";
import { nutritionTotals, serializePlan } from "./meal-plans";

test("servings scale food and recipe nutrition and cost", () => {
  const food = foods[0];
  const recipe = recipes[0];
  const totals = nutritionTotals([
    { day: 0, meal: "lunch", kind: "food", slug: food.slug, servings: 2 },
    { day: 0, meal: "dinner", kind: "recipe", slug: recipe.slug, servings: 0.5 },
  ], { foods, recipes });
  assert.equal(totals.calories, food.calories * 2 + recipe.calories * 0.5);
  assert.equal(totals.proteinG, food.proteinG * 2 + recipe.proteinG * 0.5);
  assert.equal(totals.costInRupees, food.priceInRupees * 2 + recipe.costInRupees * 0.5);
});

test("weekly totals include all seven days including empty days", () => {
  const food = foods[0];
  const plan = serializePlan({
    id: 1, ownerId: "test-only", name: "Week", days: 7, updatedAt: new Date("2026-01-01T00:00:00Z"),
    entries: [{ day: 6, meal: "snack", kind: "food", slug: food.slug, servings: 1 }],
  }, { foods, recipes });
  assert.equal(plan.dailyTotals.length, 7);
  assert.equal(plan.dailyTotals[0].calories, 0);
  assert.equal(plan.dailyTotals[6].calories, food.calories);
  assert.equal(plan.totals.calories, food.calories);
  assert.equal("ownerId" in plan, false);
});

test("missing catalogue data fails explicitly rather than hiding missing nutrition", () => {
  assert.throws(() => nutritionTotals([{ day: 0, meal: "lunch", kind: "food", slug: "missing", servings: 1 }], { foods, recipes }));
});
