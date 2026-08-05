import { useCallback, useEffect, useState } from 'react';

export interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Generic data-fetching hook. Wraps an async fetch function and exposes
 * loading/error/data state along with a refetch callback.
 */
export function useApi<T>(
  fetchFn: () => Promise<T>,
  deps: ReadonlyArray<unknown> = [],
): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchFn()
      .then((result) => {
        setData(result);
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : 'An unexpected error occurred while loading data.';
        setError(message);
      })
      .finally(() => {
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadKey]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const refetch = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  return { data, loading, error, refetch };
}
