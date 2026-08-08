import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import type {
  ApiErrorResponse,
  SessionResponse,
  SessionUser,
  SessionViewMode,
} from '../shared/api';
import {apiRequest, jsonRequest} from './queries/api';

type SessionState =
  | {status: 'loading'; user: null; reason: null}
  | {
      status: 'authenticated';
      user: SessionUser;
      reason: null;
      setViewMode: (mode: SessionViewMode) => Promise<void>;
    }
  | {status: 'unauthenticated'; user: null; reason: string | null}
  | {status: 'forbidden'; user: null; reason: string | null}
  | {status: 'error'; user: null; reason: string | null};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({children}: {children: ReactNode}) {
  const authError = new URLSearchParams(window.location.search).get('auth_error');
  const [session, setSession] = useState<SessionState>({
    status: 'loading',
    user: null,
    reason: null,
  });
  const setViewMode = useCallback(async (mode: SessionViewMode) => {
    const result = await apiRequest<SessionResponse>(
      '/session/view-mode',
      jsonRequest('POST', {mode}),
    );
    setSession({
      status: 'authenticated',
      user: result.user,
      reason: null,
      setViewMode,
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/session', {signal: controller.signal})
      .then(async (response) => {
        if (response.ok) {
          const result = (await response.json()) as SessionResponse;
          setSession({
            status: 'authenticated',
            user: result.user,
            reason: null,
            setViewMode,
          });
          return;
        }

        const result = (await response.json()) as ApiErrorResponse;
        if (response.status === 401) {
          setSession({status: 'unauthenticated', user: null, reason: authError});
        } else if (response.status === 403 || result.error.code === 'AUTH_FORBIDDEN') {
          setSession({status: 'forbidden', user: null, reason: authError});
        } else {
          setSession({status: 'error', user: null, reason: authError});
        }
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setSession({status: 'error', user: null, reason: authError});
        }
      });
    return () => controller.abort();
  }, [authError, setViewMode]);

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used inside SessionProvider');
  return session;
}
