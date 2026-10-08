import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  duration,
  matchScore,
  type Product,
  plainText,
  toSummary,
  toWork,
} from '../src/audible.ts';
import { toSummary as fromOpenLibrary, workId } from '../src/openlibrary.ts';

const product: Product = {
  asin: 'B08G9PRS1K',
  title: 'Project Hail Mary',
  authors: [{ name: 'Andy Weir' }],
  narrators: [{ name: 'Ray Porter' }],
  product_images: { '500': 'https://m.media-amazon.com/images/I/x._SL500_.jpg' },
  runtime_length_min: 970,
  release_date: '2021-05-04',
  rating: { overall_distribution: { display_average_rating: '4.9', num_ratings: 200000 } },
  publisher_summary:
    '<p><b>THE #1 BESTSELLER</b></p><p>Ryland Grace is the sole survivor&nbsp;on a mission.</p><p>------</p><p>Read by Ray Porter.</p>',
  series: [{ title: 'Standalone', sequence: '1' }],
  category_ladders: [
    { ladder: [{ name: 'Science Fiction & Fantasy' }, { name: 'Science Fiction' }] },
    { ladder: [{ name: 'Science Fiction & Fantasy' }, { name: 'Space Opera' }] },
  ],
};

test('Audible products become list items and book pages', () => {
  assert.deepEqual(toSummary(product), {
    id: 'audible:B08G9PRS1K',
    title: 'Project Hail Mary',
    authors: ['Andy Weir'],
    narrators: ['Ray Porter'],
    cover: 'https://m.media-amazon.com/images/I/x._SL500_.jpg',
    details: '16 h 10 min · ★ 4.9',
  });
  const work = toWork(product);
  assert.equal(
    work.description,
    'THE #1 BESTSELLER\nRyland Grace is the sole survivor on a mission.\nRead by Ray Porter.',
  );
  assert.deepEqual(work.genres, ['Science Fiction & Fantasy', 'Science Fiction', 'Space Opera']);
  assert.equal(work.series, 'Standalone, book 1');
  assert.equal(work.year, '2021');
  assert.deepEqual(work.chapters, []);
});

test('a rating needs ratings behind it; lengths read like a clock', () => {
  const unrated = {
    ...product,
    rating: { overall_distribution: { display_average_rating: '5.0', num_ratings: 0 } },
  };
  assert.equal(toSummary(unrated).details, '16 h 10 min');
  assert.equal(duration(45), '45 min');
  assert.equal(duration(undefined), undefined);
  assert.equal(plainText('<p></p>'), undefined);
});

test('the audiobook edition of a book: all title words and the author, plain edition first', () => {
  const p = (title: string, author = 'J.K. Rowling', minutes = 500): Product => ({
    asin: title,
    title,
    authors: [{ name: author }],
    runtime_length_min: minutes,
  });
  const title = "Harry Potter and the Philosopher's Stone";
  const plain = matchScore(p("Harry Potter and the Philosopher's Stone"), title, 'J. K. Rowling');
  const dramatized = matchScore(
    p("Harry Potter and the Philosopher's Stone (Full-Cast Dramatized Edition)"),
    title,
    'J. K. Rowling',
  );
  assert.ok(plain > dramatized && dramatized > 0);
  assert.equal(matchScore(p('Harry Potter and the Chamber of Secrets'), title, 'Rowling'), 0);
  assert.equal(matchScore(p(title, 'Someone Else'), title, 'J. K. Rowling'), 0);
});

test('Open Library results', () => {
  assert.equal(workId('/works/OL82563W'), 'ol:OL82563W');
  assert.deepEqual(
    fromOpenLibrary({
      key: '/works/OL82563W',
      title: 'A Game of Thrones',
      author_name: ['George R. R. Martin'],
      cover_i: 9269962,
      first_publish_year: 1996,
    }),
    {
      id: 'ol:OL82563W',
      title: 'A Game of Thrones',
      authors: ['George R. R. Martin'],
      cover: 'https://covers.openlibrary.org/b/id/9269962-L.jpg',
      details: 'First published 1996',
    },
  );
});
