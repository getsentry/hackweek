import {useEffect, useState} from 'react';
import type {FormEvent} from 'react';
import {Link, useParams} from 'wouter';

import type {AdminProjectSummary} from '../../shared/administration';
import {QueryState} from '../components/AppLayout';
import {useAdminMutations, useAdminYear} from '../queries/administration';

export function AdminPage() {
  const {yearId} = useParams<{yearId: string}>();
  const query = useAdminYear(yearId);
  const actions = useAdminMutations(yearId);
  const [categoryName, setCategoryName] = useState('');
  const [award, setAward] = useState({name: '', categoryId: '', projectId: ''});
  const [order, setOrder] = useState<string[]>([]);

  useEffect(() => {
    if (query.data) setOrder(query.data.screeningOrder.map(({projectId}) => projectId));
  }, [query.data]);

  function addCategory(event: FormEvent) {
    event.preventDefault();
    actions.category.mutate({name: categoryName}, {onSuccess: () => setCategoryName('')});
  }

  function addAward(event: FormEvent) {
    event.preventDefault();
    actions.award.mutate(
      {input: award},
      {onSuccess: () => setAward({name: '', categoryId: '', projectId: ''})},
    );
  }

  const error = [
    actions.year,
    actions.category,
    actions.removeCategory,
    actions.nominations,
    actions.award,
    actions.removeAward,
    actions.screening,
  ].find((mutation) => mutation.error)?.error;

  return (
    <main className="operationsPage">
      <Link className="backLink" href="/years">
        ← Archives
      </Link>
      <header className="operationsHero">
        <div>
          <p className="kicker">Control room / {yearId}</p>
          <h1>Run the year.</h1>
        </div>
        <Link className="primaryAction" href={`/admin/analytics?year=${yearId}`}>
          View analytics →
        </Link>
      </header>
      <QueryState loading={query.isLoading} error={query.error}>
        {query.data && (
          <div className="adminGrid">
            <section className="controlPanel">
              <p className="kicker">State</p>
              <h2>Year gates</h2>
              <label className="switchRow">
                <span>Submissions closed</span>
                <input
                  type="checkbox"
                  checked={query.data.year.submissionsClosed}
                  onChange={(event) =>
                    actions.year.mutate({
                      ...query.data.year,
                      submissionsClosed: event.target.checked,
                    })
                  }
                />
              </label>
              <label className="switchRow">
                <span>Voting enabled</span>
                <input
                  type="checkbox"
                  checked={query.data.year.votingEnabled}
                  onChange={(event) =>
                    actions.year.mutate({
                      ...query.data.year,
                      votingEnabled: event.target.checked,
                    })
                  }
                />
              </label>
            </section>
            <section className="controlPanel controlPanel--wide">
              <p className="kicker">Ballot structure</p>
              <h2>Categories</h2>
              <form className="inlineForm" onSubmit={addCategory}>
                <input
                  aria-label="Category name"
                  value={categoryName}
                  onChange={(event) => setCategoryName(event.target.value)}
                  placeholder="New category"
                />
                <button className="primaryAction">Add category</button>
              </form>
              <ul className="adminList">
                {query.data.categories.map((category) => (
                  <li key={category.id}>
                    <span>{category.name}</span>
                    <button
                      className="dangerAction"
                      onClick={() => actions.removeCategory.mutate(category.id)}
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            <section className="controlPanel controlPanel--wide">
              <p className="kicker">Eligibility</p>
              <h2>Project nominations</h2>
              {query.data.projects.map((project) => (
                <NominationEditor
                  key={project.id}
                  project={project}
                  categories={query.data.categories}
                  onSave={(categoryIds) =>
                    actions.nominations.mutate({projectId: project.id, categoryIds})
                  }
                />
              ))}
            </section>
            <section className="controlPanel controlPanel--wide">
              <p className="kicker">Results</p>
              <h2>Awards</h2>
              <form className="adminForm" onSubmit={addAward}>
                <input
                  aria-label="Award name"
                  value={award.name}
                  onChange={(event) => setAward({...award, name: event.target.value})}
                  placeholder="Display name"
                  required
                />
                <select
                  aria-label="Award category"
                  value={award.categoryId}
                  onChange={(event) =>
                    setAward({...award, categoryId: event.target.value})
                  }
                  required
                >
                  <option value="">Category</option>
                  {query.data.categories.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Award project"
                  value={award.projectId}
                  onChange={(event) =>
                    setAward({...award, projectId: event.target.value})
                  }
                  required
                >
                  <option value="">Project</option>
                  {query.data.projects.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <button className="primaryAction">Record award</button>
              </form>
              <ul className="adminList">
                {query.data.awards.map((item) => (
                  <li key={item.id}>
                    <span>
                      <strong>{item.categoryName}</strong> — {item.projectName}
                    </span>
                    <button
                      className="dangerAction"
                      onClick={() => actions.removeAward.mutate(item.id)}
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            <section className="controlPanel controlPanel--wide">
              <p className="kicker">Screening primitive</p>
              <h2>Deterministic order</h2>
              <p>
                Order projects now; video readiness is added later. Every save replaces
                the ordered list atomically.
              </p>
              <select
                aria-label="Add screening project"
                defaultValue=""
                onChange={(event) => {
                  if (event.target.value && !order.includes(event.target.value))
                    setOrder([...order, event.target.value]);
                  event.target.value = '';
                }}
              >
                <option value="">Add project…</option>
                {query.data.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              <ol className="orderList">
                {order.map((id, index) => {
                  const project = query.data.projects.find((item) => item.id === id);
                  return (
                    <li key={id}>
                      <span>
                        {index + 1}. {project?.name}
                      </span>
                      <div>
                        <button
                          disabled={index === 0}
                          onClick={() => setOrder(move(order, index, index - 1))}
                        >
                          ↑
                        </button>
                        <button
                          disabled={index === order.length - 1}
                          onClick={() => setOrder(move(order, index, index + 1))}
                        >
                          ↓
                        </button>
                        <button
                          className="dangerAction"
                          onClick={() => setOrder(order.filter((item) => item !== id))}
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <button
                className="primaryAction"
                onClick={() => actions.screening.mutate(order)}
              >
                Save screening order
              </button>
            </section>
          </div>
        )}
      </QueryState>
      {error && (
        <p className="formError" role="alert">
          {error.message}
        </p>
      )}
    </main>
  );
}

function NominationEditor({
  project,
  categories,
  onSave,
}: {
  project: AdminProjectSummary;
  categories: {id: string; name: string}[];
  onSave: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState(
    project.nominations.map(({categoryId}) => categoryId),
  );
  useEffect(
    () => setSelected(project.nominations.map(({categoryId}) => categoryId)),
    [project.nominations],
  );
  return (
    <div className="nominationRow">
      <strong>{project.name}</strong>
      <div>
        {categories.map((category) => (
          <label key={category.id}>
            <input
              type="checkbox"
              checked={selected.includes(category.id)}
              disabled={!selected.includes(category.id) && selected.length >= 2}
              onChange={(event) =>
                setSelected(
                  event.target.checked
                    ? [...selected, category.id]
                    : selected.filter((id) => id !== category.id),
                )
              }
            />
            {category.name}
          </label>
        ))}
      </div>
      <button className="textAction" onClick={() => onSave(selected)}>
        Save
      </button>
    </div>
  );
}

function move(items: string[], from: number, to: number) {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
