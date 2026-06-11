import { useState, useCallback } from 'react';

export function useLoadMore<T>(
  initialItems: T[],
  fetchMore: (lastItem?: T) => Promise<T[]>,
  pageSize: number = 20
) {
  const [items, setItems] = useState<T[]>(initialItems);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;

    setLoading(true);
    try {
      const lastItem = items[items.length - 1];
      const newItems = await fetchMore(lastItem);

      if (newItems.length < pageSize) {
        setHasMore(false);
      }

      setItems((prev) => [...prev, ...newItems]);
    } finally {
      setLoading(false);
    }
  }, [items, loading, hasMore, fetchMore, pageSize]);

  return {
    items,
    loading,
    hasMore,
    loadMore,
    reset: () => {
      setItems(initialItems);
      setHasMore(true);
    },
  };
}
