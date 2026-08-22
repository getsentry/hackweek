import {describe, expect, it} from 'vitest';

import {getAwardCategoryDescription} from '../../src/app/awardCategories';

describe('getAwardCategoryDescription', () => {
  it.each([
    ['Best use of AI', 'Clever and innovative twists with AI.'],
    ['For the devs!', 'Tools, workflows, or features that make developer life better.'],
    [
      'Just ship it already',
      'The project so useful or obvious you wonder why it isn’t live yet.',
    ],
    [
      'Sentry AF',
      'The one that feels the most “us”: quirky, sharp, unmistakably Sentry.',
    ],
    ['The quiet win', 'Small but mighty improvements that make a big difference.'],
  ])('describes %s with category-specific guidance', (name, expected) => {
    expect(getAwardCategoryDescription(name)).toBe(expected);
  });

  it('gives new categories useful fallback guidance', () => {
    expect(getAwardCategoryDescription('Wildcard')).toBe(
      'A focused award category for projects that best fit this theme.',
    );
  });
});
