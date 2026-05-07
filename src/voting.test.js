import {
  NO_CATEGORY_SECTION_KEY,
  findExistingVoteForCategory,
  getAwardCategorySelectionValues,
  getAuthUserVotes,
  getGroupedAwardCategoryOptions,
  getProjectNominationValues,
  getVoteKey,
  groupProjectsByAwardCategory,
  isProjectMember,
} from './voting';

const awardCategories = {
  ai: {name: 'Best use of AI'},
  devs: {name: 'For the devs!'},
  quiet: {name: 'The quiet win'},
};

it('generates deterministic vote keys', () => {
  expect(getVoteKey('user-1', 'ai')).toBe('user-1:ai');
});

it('extracts current user votes from keyed vote maps', () => {
  const votes = getAuthUserVotes('user-1', {
    'user-1:ai': {creator: 'user-1', awardCategory: 'ai', project: 'p1'},
    'user-2:ai': {creator: 'user-2', awardCategory: 'ai', project: 'p2'},
  });

  expect(votes).toEqual([
    {
      key: 'user-1:ai',
      creator: 'user-1',
      awardCategory: 'ai',
      project: 'p1',
    },
  ]);
});

it('normalizes duplicate project nominations', () => {
  expect(
    getProjectNominationValues({
      nominatedAwardCategory1: 'ai',
      nominatedAwardCategory2: 'ai',
    })
  ).toEqual(['ai']);
});

it('normalizes award category select values', () => {
  expect(
    getAwardCategorySelectionValues([
      {value: 'ai', label: 'Best use of AI'},
      {value: 'ai', label: 'Best use of AI'},
      {value: 'devs', label: 'For the devs!'},
      {value: 'quiet', label: 'The quiet win'},
    ])
  ).toEqual(['ai', 'devs']);
});

it('checks project membership by uid', () => {
  expect(isProjectMember({members: {'user-1': {ts: 1}}}, 'user-1')).toBe(true);
  expect(isProjectMember({members: {'user-1': {ts: 1}}}, 'user-2')).toBe(false);
});

it('finds existing category votes excluding the current project', () => {
  const existingVote = findExistingVoteForCategory(
    {
      'user-1:ai': {creator: 'user-1', awardCategory: 'ai', project: 'p1'},
      'user-1:devs': {creator: 'user-1', awardCategory: 'devs', project: 'p2'},
    },
    'user-1',
    'ai',
    'p2'
  );

  expect(existingVote.project).toBe('p1');
  expect(
    findExistingVoteForCategory(
      {'user-1:ai': {creator: 'user-1', awardCategory: 'ai', project: 'p1'}},
      'user-1',
      'ai',
      'p1'
    )
  ).toBeUndefined();
});

it('groups projects by nominated award categories plus no category', () => {
  const sections = groupProjectsByAwardCategory(
    {
      p1: {name: 'Alpha', nominatedAwardCategory1: 'ai'},
      p2: {name: 'Beta', nominatedAwardCategory1: 'ai', nominatedAwardCategory2: 'devs'},
      p3: {name: 'Gamma'},
      p4: {name: 'Idea', isIdea: true},
    },
    awardCategories
  );

  expect(sections.find((section) => section.key === 'ai').projects.map((p) => p.key)).toEqual([
    'p1',
    'p2',
  ]);
  expect(
    sections.find((section) => section.key === 'devs').projects.map((p) => p.key)
  ).toEqual(['p2']);
  expect(
    sections
      .find((section) => section.key === NO_CATEGORY_SECTION_KEY)
      .projects.map((p) => p.key)
  ).toEqual(['p3']);
});

it('builds grouped category options with nominated categories first', () => {
  const groups = getGroupedAwardCategoryOptions(awardCategories, {
    nominatedAwardCategory1: 'devs',
  });

  expect(groups[0]).toEqual({
    label: 'Nominated Categories',
    options: [{value: 'devs', label: 'For the devs!'}],
  });
  expect(groups[1].label).toBe('Other Categories');
  expect(groups[1].options.map((option) => option.value)).toEqual(['ai', 'quiet']);
});
