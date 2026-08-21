const CATEGORY_GUIDANCE = [
  {
    matches: ['best use of ai'],
    description: 'Clever and innovative twists with AI.',
  },
  {
    matches: ['for the devs'],
    description: 'Tools, workflows, or features that make developer life better.',
  },
  {
    matches: ['just ship it already'],
    description: 'The project so useful or obvious you wonder why it isn’t live yet.',
  },
  {
    matches: ['sentry af'],
    description: 'The one that feels the most “us”: quirky, sharp, unmistakably Sentry.',
  },
  {
    matches: ['the quiet win'],
    description: 'Small but mighty improvements that make a big difference.',
  },
] as const;

const DEFAULT_GUIDANCE =
  'A focused award category for projects that best fit this theme.';

export function getAwardCategoryDescription(name: string) {
  const normalizedName = name.trim().toLowerCase();
  return (
    CATEGORY_GUIDANCE.find(({matches}) =>
      matches.some((match) => normalizedName.includes(match)),
    )?.description ?? DEFAULT_GUIDANCE
  );
}
