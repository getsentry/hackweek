import {describe, expect, it} from 'vitest';

import {getAwardCategoryDescription} from '../../src/app/awardCategories';

describe('getAwardCategoryDescription', () => {
  it.each([
    ['Moonshot', 'boldest idea'],
    ['Craft prize', 'strongest execution'],
    ['Biggest impact', 'meaningful difference'],
    ['Delight', 'most joy'],
  ])('describes %s with category-specific guidance', (name, expected) => {
    expect(getAwardCategoryDescription(name)).toContain(expected);
  });

  it('gives new categories useful fallback guidance', () => {
    expect(getAwardCategoryDescription('Wildcard')).toContain('best embodies this award');
  });
});
