import { and, eq, sql } from "drizzle-orm";
import { db, catalogueTable, type CatalogueRow } from "@workspace/db";
import { GetFoodResponse, GetFoodsResponse, GetRecipeResponse, GetRecipesResponse, GetGymsResponse, GetStaffCatalogueResponse } from "@workspace/api-zod";
import { foods, recipes, gyms } from "./catalog";

// Additive, transactional and repeatable. Never updates existing catalogue or enquiry rows.
export async function initializeCatalogue() {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(78403211)`);
    await tx.execute(sql`
      CREATE TABLE IF NOT EXISTS nutrio_catalogue (
        kind text NOT NULL, key text NOT NULL, data jsonb NOT NULL,
        available boolean NOT NULL DEFAULT true,
        operator_supplied boolean NOT NULL DEFAULT false,
        verified boolean NOT NULL DEFAULT false,
        verification_note text NOT NULL DEFAULT '', updated_by text,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (kind, key)
      );
      ALTER TABLE nutrio_food_orders ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'received';
      ALTER TABLE nutrio_food_orders ADD COLUMN IF NOT EXISTS staff_note text NOT NULL DEFAULT '';
      ALTER TABLE nutrio_gym_partnerships ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'received';
      ALTER TABLE nutrio_gym_partnerships ADD COLUMN IF NOT EXISTS staff_note text NOT NULL DEFAULT '';
      ALTER TABLE nutrio_contact_messages ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'received';
      ALTER TABLE nutrio_contact_messages ADD COLUMN IF NOT EXISTS staff_note text NOT NULL DEFAULT '';
    `);
    for (const [kind, entries] of [["food", foods], ["recipe", recipes], ["gym", gyms]] as const) {
      for (const entry of entries) {
        await tx.insert(catalogueTable).values({
          kind, key: "slug" in entry ? entry.slug : entry.id,
          data: entry, available: true, operatorSupplied: false, verified: false,
        }).onConflictDoNothing();
      }
    }
  });
}

export function publicListing(row: CatalogueRow) {
  const data = { ...row.data, available: row.available, demonstration: !(row.operatorSupplied && row.verified) };
  if (row.kind === "food") return GetFoodResponse.parse(data);
  if (row.kind === "recipe") return GetRecipeResponse.parse(data);
  return GetGymsResponse.parse([data])[0];
}

export function staffListing(row: CatalogueRow) {
  return GetStaffCatalogueResponse.element.parse({
    kind: row.kind, key: row.key, available: row.available,
    operatorSupplied: row.operatorSupplied, verified: row.verified,
    verificationNote: row.verificationNote, updatedAt: row.updatedAt.toISOString(),
    [row.kind]: publicListing(row),
  });
}

export async function catalogueRows(kind?: string, publicOnly = false) {
  return db.select().from(catalogueTable).where(and(
    kind ? eq(catalogueTable.kind, kind) : undefined,
    publicOnly ? eq(catalogueTable.available, true) : undefined,
  )).orderBy(catalogueTable.key);
}

export async function findCatalogueItem(kind: string, key: string, availableOnly = false) {
  const [row] = await db.select().from(catalogueTable).where(and(
    eq(catalogueTable.kind, kind), eq(catalogueTable.key, key),
    availableOnly ? eq(catalogueTable.available, true) : undefined,
  ));
  return row ? publicListing(row) : undefined;
}

// Include inactive entries so saved plans remain resolvable; writes use this same DB source.
export async function nutritionCatalogue() {
  const rows = await catalogueRows();
  return {
    foods: GetFoodsResponse.parse(rows.filter((r) => r.kind === "food").map(publicListing)),
    recipes: GetRecipesResponse.parse(rows.filter((r) => r.kind === "recipe").map(publicListing)),
  };
}
