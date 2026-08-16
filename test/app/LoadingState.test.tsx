import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {PageState} from '../../src/app/components/AppLayout';

describe('Hackweek loading state', () => {
  it('shows the branded loading indicator and exposes its busy state', () => {
    const {container} = render(
      <PageState title="Loading Hackweek" detail="Loading Hackweek records…" loading />,
    );

    const state = screen
      .getByRole('heading', {name: 'Loading Hackweek'})
      .closest('section');
    expect(state?.getAttribute('aria-busy')).toBe('true');
    expect(container.querySelectorAll('.hackweekLoaderTiles span')).toHaveLength(5);
    expect(container.querySelector('.hackweekLoader')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
  });
});
