import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CreateStaffListingBody, GetRecipeResponse } from '@workspace/api-zod';
import { validateListing } from '../routes/staff';
import { recipes } from './catalog';

const recipe = recipes[0];
const listing = (youtubeVideoId?: string) => ({
  kind: 'recipe', key: recipe.slug, available: true, operatorSupplied: true,
  verified: false, verificationNote: '',
  recipe: { ...recipe, ...(youtubeVideoId === undefined ? {} : { youtubeVideoId }) },
});
test('existing recipes remain valid, and video IDs survive API validation', () => {
  assert.equal(CreateStaffListingBody.safeParse(listing()).success, true);
  const result = validateListing(listing('abcdefghijk'));
  assert.ok(result.value);
  const wire = GetRecipeResponse.parse(result.value.data);
  assert.equal(wire.youtubeVideoId, 'abcdefghijk');
});
test('clearing the video is valid, and arbitrary URLs or HTML are rejected', () => {
  const result = validateListing(listing(''));
  assert.ok(result.value);
  assert.equal(GetRecipeResponse.parse(result.value.data).youtubeVideoId, '');
  for (const value of ['short', '<iframe>bad</iframe>', 'https://evil.test/video']) {
    assert.ok('error' in validateListing(listing(value)));
  }
});
