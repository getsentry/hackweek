import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';

import {App} from './App';
import {SessionProvider} from './session';
import {initializeTheme} from './theme';
import './styles.css';

initializeTheme();

const root = document.getElementById('root');

if (!root) {
  throw new Error('Missing application root');
}

const queryClient = new QueryClient({
  defaultOptions: {queries: {staleTime: 30_000, retry: 1}},
});

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <App />
      </SessionProvider>
    </QueryClientProvider>
  </StrictMode>,
);
