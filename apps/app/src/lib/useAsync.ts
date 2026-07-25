import { useCallback, useEffect, useState } from 'react';
import { ApiError } from './api';

export type AsyncState<T> =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; data: T };

/**
 * Minimal fetch-and-render hook backing the four-state screen contract.
 *
 * Deliberately small: TanStack Query with its persister comes back in the caching pass,
 * and this keeps the same shape (loading / error / ready) so screens will not need
 * rewriting when it does.
 */
export function useAsync<T>(
  fn: () => Promise<T>,
  deps: unknown[] = [],
): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ phase: 'loading' });

  const run = useCallback(async () => {
    setState({ phase: 'loading' });
    try {
      setState({ phase: 'ready', data: await fn() });
    } catch (err) {
      setState({
        phase: 'error',
        message: err instanceof ApiError ? err.message : 'Onbekende fout.',
      });
    }
    // fn is recreated per render by callers; deps is the real dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    void run();
  }, [run]);

  return { ...state, reload: run };
}
