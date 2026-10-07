import { test } from "node:test";
import assert from "node:assert/strict";
import { foods, recipes, gyms } from "./catalog";
import { validateListing } from "../routes/staff";

const foodListing = () => ({
  kind: "food", key: foods[0].slug, food: structuredClone(foods[0]),
  available: true, operatorSupplied: false, verified: false, verificationNote: "",
});

test("demonstration seed remains unverified, and forged public flags are discarded", () => {
  const input = foodListing();
  input.food.demonstration = false;
  const result = validateListing(input);
  assert.ok(result.value);
  assert.equal(result.value.verified, false);
  assert.equal(result.value.operatorSupplied, false);
  assert.equal("demonstration" in result.value.data, false);
});

test("verification requires operator provenance and an explanatory note", () => {
  const input = foodListing();
  input.verified = true;
  assert.ok("error" in validateListing(input));
  input.operatorSupplied = true;
  assert.ok("error" in validateListing(input));
  input.verificationNote = "Confirmed ingredients and prices with kitchen operator.";
  assert.ok("value" in validateListing(input));
});

test("new operator gyms cannot be published before approval", () => {
  const input = {
    kind: "gym", key: gyms[0].id, gym: structuredClone(gyms[0]), available: true,
    operatorSupplied: true, verified: false, verificationNote: "",
  };
  assert.ok("error" in validateListing(input));
  input.available = false;
  assert.ok("value" in validateListing(input));
  input.available = true; input.verified = true;
  input.verificationNote = "Gym operator confirmed the address and hours.";
  assert.ok("value" in validateListing(input));
});

test("identifiers, listing type and negative nutrition are rejected", () => {
  const input = foodListing();
  assert.ok("error" in validateListing({ ...input, key: "different-key" }));
  assert.ok("error" in validateListing({ ...input, recipe: recipes[0] }));
  input.food.proteinG = -1;
  assert.ok("error" in validateListing(input));
});

test("recipe ingredient quantities must be complete", () => {
  const recipe = structuredClone(recipes[0]);
  recipe.ingredients[0].quantity = "";
  assert.ok("error" in validateListing({
    kind: "recipe", key: recipe.slug, recipe, available: true,
    operatorSupplied: true, verified: false, verificationNote: "",
  }));
});
