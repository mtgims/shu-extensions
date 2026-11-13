import assert from 'node:assert/strict';
import { test } from 'node:test';
import { goldId, postOf, splitTitle } from '../src/golden/site.ts';

test('Golden Audiobooks: author and title from a post title', () => {
  assert.deepEqual(splitTitle('Andy Weir &#8211; Project Hail Mary Audiobook'), {
    author: 'Andy Weir',
    title: 'Project Hail Mary',
  });
  assert.deepEqual(splitTitle('Ernest Cline &#8211; Ready Player One Audiobook Free Online'), {
    author: 'Ernest Cline',
    title: 'Ready Player One',
  });
  // No author, the site's own typo and a narrator.
  assert.deepEqual(splitTitle('Harry Potter and the Half Blood Prince Audibook (Stephen Fry)'), {
    title: 'Harry Potter and the Half Blood Prince',
    narrator: 'Stephen Fry',
  });
  assert.equal(postOf(goldId(30532)), '30532');
  assert.equal(postOf('atb:h:abc'), undefined);
});
