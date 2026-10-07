import { test } from "node:test";
import assert from "node:assert/strict";
import type { Food, MealEntry } from "@workspace/api-client-react";
import { buildHtml, buildCsv, sumEntries, type Catalogue, DAY_NAMES } from "./plan";
import { DISCLAIMER } from "./disclaimer";

const food: Food = {
  slug: "fractional-food", name: "<Example food>", description: "", category: "",
  priceInRupees: 149, calories: 450, proteinG: 28, carbsG: 45, fatG: 18, fiberG: 8,
  portion: "bowl", prepMinutes: 10, ingredients: [], allergens: [], tags: [],
  imageUrl: "", vegetarian: true, bestFor: [],
};
const catalogue: Catalogue = { foods: new Map([[food.slug, food]]), recipes: new Map() };
const entries: MealEntry[] = [{ day: 0, meal: "lunch", kind: "food", slug: food.slug, servings: 1.25 }];

test("HTML and CSV exports preserve fractional nutrition and cost totals", () => {
  const totals = sumEntries(catalogue, entries);
  assert.equal(totals.calories, 562.5);
  assert.equal(totals.costInRupees, 186.25);
  const html = buildHtml("Week <one>", 7, entries, catalogue);
  const csv = buildCsv("Week one", 7, entries, catalogue);
  for (const value of Object.values(totals)) {
    assert.ok(html.includes(`<td>${value}</td>`), `HTML should include exact value ${value}`);
  }
  assert.ok(csv.includes("Overall,Plan total,,,,562.5,35,56.25,22.5,10,186.25"));
  for (const day of DAY_NAMES) {
    assert.ok(html.includes(day));
    assert.ok(csv.includes(day));
  }
  assert.ok(html.includes(DISCLAIMER));
  assert.ok(csv.includes(DISCLAIMER));
  assert.ok(html.includes("Week &lt;one&gt;"));
  assert.ok(html.includes("&lt;Example food&gt;"));
});
