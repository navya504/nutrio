import assert from 'node:assert/strict';
import { test } from 'node:test';
import { youtubeVideoId } from './youtube';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RecipeVideo } from '../components/recipe-video';

const id = 'abcdefghijk';
test('accepts watch, share, Shorts, live and embed URLs', () => {
  for (const url of [
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?feature=shared&v=${id}&t=30`,
    `https://youtu.be/${id}?si=share`,
    `https://m.youtube.com/shorts/${id}`,
    `https://www.youtube.com/live/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
  ]) assert.equal(youtubeVideoId(url), id);
});
test('rejects fake hosts, unsafe schemes, HTML, playlists and invalid IDs', () => {
  for (const url of [
    '', 'not a link', `<iframe src="https://youtube.com/embed/${id}"></iframe>`,
    `http://youtube.com/watch?v=${id}`, `javascript:alert(1)`,
    `https://youtube.com.evil.test/watch?v=${id}`,
    `https://youtube.com@evil.test/watch?v=${id}`,
    `https://user:pass@youtube.com/watch?v=${id}`,
    `https://youtube.com:123/watch?v=${id}`,
    'https://youtube.com/playlist?list=test',
    'https://youtube.com/watch?v=short',
    `https://youtu.be/${id}/extra`,
  ]) assert.equal(youtubeVideoId(url), null, url);
});
test('video renders a responsive, titled privacy-enhanced embed and fallback link', () => {
  const html = renderToStaticMarkup(createElement(RecipeVideo, { videoId: id, name: 'Oats' }));
  assert.ok(html.includes(`https://www.youtube-nocookie.com/embed/${id}`));
  assert.ok(html.includes(`https://www.youtube.com/watch?v=${id}`));
  assert.ok(html.includes('aspect-video'));
  assert.ok(html.includes('Oats — preparation video'));
  assert.ok(html.includes('allowFullScreen=""'));
  assert.ok(!html.includes('autoplay=1'));
});
test('missing or invalid video never renders an empty or unsafe player', () => {
  for (const videoId of [undefined, '', '<iframe>', 'https://evil.test']) {
    assert.equal(renderToStaticMarkup(createElement(RecipeVideo, { videoId, name: 'Oats' })), '');
  }
});
