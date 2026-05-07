export const NO_CATEGORY_SECTION_KEY = 'no-category';

export function getVoteKey(uid, awardCategoryKey) {
  return `${uid}:${awardCategoryKey}`;
}

function mapList(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  return Object.keys(collection).map((key) => ({
    ...collection[key],
    key: collection[key]?.key || key,
  }));
}

export function getSortedAwardCategories(awardCategories) {
  return mapList(awardCategories).sort((a, b) =>
    ('' + a.name).localeCompare(b.name)
  );
}

export function getAuthUserVotes(uid, voteList) {
  if (!uid) return [];
  return mapList(voteList).filter((vote) => vote.creator === uid);
}

export function getVotesByCategory(uid, voteList) {
  return getAuthUserVotes(uid, voteList).reduce((result, vote) => {
    if (vote.awardCategory) result[vote.awardCategory] = vote;
    return result;
  }, {});
}

export function getProjectNominationValues(project) {
  return [project?.nominatedAwardCategory1, project?.nominatedAwardCategory2]
    .filter((value, index, values) => value && values.indexOf(value) === index)
    .slice(0, 2);
}

export function getAwardCategorySelectionValues(selection) {
  return (selection || [])
    .map(({value}) => value)
    .filter((value, index, values) => value && values.indexOf(value) === index)
    .slice(0, 2);
}

export function getProjectNominationSelectValue(project, awardCategories) {
  const categoriesByKey = getSortedAwardCategories(awardCategories).reduce(
    (result, category) => {
      result[category.key] = category;
      return result;
    },
    {}
  );

  return getProjectNominationValues(project).map((value) => ({
    value,
    label: categoriesByKey[value]?.name || value,
  }));
}

export function getAwardCategoryOptions(awardCategories) {
  return getSortedAwardCategories(awardCategories).map((category) => ({
    value: category.key,
    label: category.name,
  }));
}

export function getGroupedAwardCategoryOptions(awardCategories, project) {
  const options = getAwardCategoryOptions(awardCategories);
  const nominationValues = getProjectNominationValues(project);

  if (!nominationValues.length) {
    return [{label: 'All Categories', options}];
  }

  const nominatedOptions = options.filter((option) =>
    nominationValues.includes(option.value)
  );
  const otherOptions = options.filter((option) => !nominationValues.includes(option.value));

  return [
    {label: 'Nominated Categories', options: nominatedOptions},
    {label: 'Other Categories', options: otherOptions},
  ].filter((group) => group.options.length > 0);
}

export function isProjectMember(project, uid) {
  if (!project || !uid) return false;
  return Object.prototype.hasOwnProperty.call(project.members || {}, uid);
}

export function findExistingVoteForCategory(
  voteList,
  uid,
  awardCategoryKey,
  excludeProjectKey
) {
  return getAuthUserVotes(uid, voteList).find(
    (vote) =>
      vote.awardCategory === awardCategoryKey &&
      (!excludeProjectKey || vote.project !== excludeProjectKey)
  );
}

export function findProjectByKey(projects, projectKey) {
  return mapList(projects).find((project) => project.key === projectKey) || null;
}

export function groupProjectsByAwardCategory(projects, awardCategories) {
  const categories = getSortedAwardCategories(awardCategories);
  const sections = categories.map((category) => ({
    key: category.key,
    title: category.name,
    category,
    projects: [],
  }));
  const sectionByKey = sections.reduce((result, section) => {
    result[section.key] = section;
    return result;
  }, {});
  const noCategorySection = {
    key: NO_CATEGORY_SECTION_KEY,
    title: 'No Category',
    category: null,
    projects: [],
  };

  mapList(projects)
    .filter((project) => !project.isIdea)
    .sort((a, b) => ('' + a.name).localeCompare(b.name))
    .forEach((project) => {
      const nominationValues = getProjectNominationValues(project);
      let matchedSection = false;

      nominationValues.forEach((awardCategoryKey) => {
        if (sectionByKey[awardCategoryKey]) {
          sectionByKey[awardCategoryKey].projects.push(project);
          matchedSection = true;
        }
      });

      if (!matchedSection) {
        noCategorySection.projects.push(project);
      }
    });

  return [...sections, noCategorySection];
}
