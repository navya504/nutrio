import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { clearOtherPlanDrafts, clearPlanDraft, readPlanDraft, writePlanDraft } from './plan-draft';

const data = new Map<string, string>();
const storage = {
  get length() { return data.size; },
  key: (i: number) => [...data.keys()][i] ?? null,
  getItem: (key: string) => data.get(key) ?? null,
  setItem: (key: string, value: string) => { data.set(key, value); },
  removeItem: (key: string) => { data.delete(key); },
};
beforeEach(() => {
  data.clear();
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
});
const draft = {
  name: 'Unfinished week', days: 7 as const,
  entries: [{ day: 6, meal: 'snack' as const, kind: 'food' as const, slug: 'fruit', servings: 1.25 }],
};

test('recovery preserves edits without storing a saved-plan ID or UI keys', () => {
  writePlanDraft('member-a', { ...draft, id: 42, entries: [{ ...draft.entries[0], key: 'e1' }] } as typeof draft);
  assert.deepEqual(readPlanDraft('member-a'), draft);
  assert.equal([...data.values()][0].includes('"id"'), false);
  assert.equal([...data.values()][0].includes('"key"'), false);
});

test('one member cannot recover another member’s draft, even with a forged owner', () => {
  writePlanDraft('member-a', draft);
  assert.equal(readPlanDraft('member-b'), null);
  data.set('nutrio-plan-draft-v1:member-b', [...data.values()][0]);
  assert.equal(readPlanDraft('member-b'), null);
  assert.deepEqual(readPlanDraft('member-a'), draft);
});

test('sign-out removes all member drafts but preserves unrelated browser data', () => {
  writePlanDraft('member-a', draft);
  writePlanDraft('member-b', draft);
  data.set('nutrio-cart-v1', 'cart');
  clearOtherPlanDrafts(null);
  assert.deepEqual([...data.entries()], [['nutrio-cart-v1', 'cart']]);
});

test('account switch removes previous drafts, and save/discard clears the current one', () => {
  writePlanDraft('member-a', draft);
  writePlanDraft('member-b', draft);
  clearOtherPlanDrafts('member-b');
  assert.equal(readPlanDraft('member-a'), null);
  assert.deepEqual(readPlanDraft('member-b'), draft);
  clearPlanDraft('member-b');
  assert.equal(readPlanDraft('member-b'), null);
});

test('invalid JSON and out-of-range meals are discarded rather than loaded', () => {
  const key = 'nutrio-plan-draft-v1:member-a';
  for (const value of ['not JSON', JSON.stringify({ version: 1, owner: 'member-a', ...draft, days: 1 })]) {
    data.set(key, value);
    assert.equal(readPlanDraft('member-a'), null);
    assert.equal(data.has(key), false);
  }
});

test('unavailable storage fails explicitly, so the editor can warn the member', () => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Storage blocked'); } });
  assert.throws(() => writePlanDraft('member-a', draft), /Storage blocked/);
  assert.throws(() => readPlanDraft('member-a'), /Storage blocked/);
});
