import { z } from 'zod';
import type { MealEntry } from '@workspace/api-client-react';

const PREFIX = 'nutrio-plan-draft-v1:';
const draftSchema = z.object({
  version: z.literal(1),
  owner: z.string().min(1),
  name: z.string().max(120),
  days: z.union([z.literal(1), z.literal(7)]),
  entries: z.array(z.object({
    day: z.number().int().min(0).max(6),
    meal: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
    kind: z.enum(['food', 'recipe']),
    slug: z.string().min(1),
    servings: z.number().min(0.25).max(20),
  })).max(200),
}).refine((d) => d.entries.every((e) => e.day < d.days));

export type RecoverablePlan = { name: string; days: 1 | 7; entries: MealEntry[] };

// No saved-plan ID is persisted: recovery can only create a separate plan.
export function readPlanDraft(owner: string): RecoverablePlan | null {
  const raw = localStorage.getItem(PREFIX + owner);
  if (!raw) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { clearPlanDraft(owner); return null; }
  const result = draftSchema.safeParse(parsed);
  if (!result.success || result.data.owner !== owner) {
    clearPlanDraft(owner);
    return null;
  }
  const { name, days, entries } = result.data;
  return { name, days, entries };
}

export function writePlanDraft(owner: string, draft: RecoverablePlan) {
  // Strip UI keys and IDs, and validate before storing untrusted recovery data.
  const value = draftSchema.parse({
    version: 1, owner, name: draft.name, days: draft.days,
    entries: draft.entries.map(({ day, meal, kind, slug, servings }) => ({ day, meal, kind, slug, servings })),
  });
  localStorage.setItem(PREFIX + owner, JSON.stringify(value));
}

export function clearPlanDraft(owner: string) {
  localStorage.removeItem(PREFIX + owner);
}

export function clearOtherPlanDrafts(owner: string | null) {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key?.startsWith(PREFIX) && key !== PREFIX + owner) localStorage.removeItem(key);
  }
}
