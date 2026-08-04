import {useState} from 'react';
import {useLocation} from 'wouter';

import {useCreateYear} from '../queries/administration';

export function YearAdministrationPage() {
  const [, navigate] = useLocation();
  const [yearId, setYearId] = useState(String(new Date().getUTCFullYear()));
  const create = useCreateYear();
  return (
    <main className="operationsPage">
      <header className="operationsHero pageHeader">
        <div>
          <p className="kicker">Hackweek admin</p>
          <h1>create a year</h1>
        </div>
        <p>
          Create a stable four-digit year, then configure its groups, categories, ballot,
          awards, and screening order.
        </p>
      </header>
      <form
        className="controlPanel yearCreateForm"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate(yearId, {onSuccess: () => navigate(`/admin/years/${yearId}`)});
        }}
      >
        <label>
          Hackweek year
          <input
            aria-label="Hackweek year"
            value={yearId}
            onChange={(event) => setYearId(event.target.value)}
            inputMode="numeric"
            pattern="[0-9]{4}"
            required
          />
        </label>
        <button className="primaryAction" disabled={create.isPending}>
          Create year
        </button>
        {create.error && (
          <p className="formError" role="alert">
            {create.error.message}
          </p>
        )}
      </form>
    </main>
  );
}
