const CATEGORY_GUIDANCE = [
  {
    matches: ['moonshot'],
    description:
      'The boldest idea with the biggest upside, even if it is experimental. Example: a new capability that changes how we work.',
  },
  {
    matches: ['craft'],
    description:
      'The strongest execution and attention to detail. Example: a polished, reliable experience that feels ready to ship.',
  },
  {
    matches: ['impact'],
    description:
      'The project most likely to make a meaningful difference. Example: saving teams hours or solving a widespread problem.',
  },
  {
    matches: ['delight'],
    description:
      'The project that brings the most joy or surprise. Example: turning a frustrating workflow into something people enjoy.',
  },
] as const;

const DEFAULT_GUIDANCE =
  'Choose the project that best embodies this award. Look for a clear fit with the category, not just your overall favorite.';

export function getAwardCategoryDescription(name: string) {
  const normalizedName = name.trim().toLocaleLowerCase();
  return (
    CATEGORY_GUIDANCE.find(({matches}) =>
      matches.some((match) => normalizedName.includes(match)),
    )?.description ?? DEFAULT_GUIDANCE
  );
}
