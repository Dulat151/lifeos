"use client";
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/ui";

export function useGet<T>(key: QueryKey, path: string | null, opts: { refetchInterval?: number; enabled?: boolean } = {}) {
  return useQuery<T, ApiError>({
    queryKey: key,
    queryFn: ({ signal }) => api<T>(path as string, { signal }),
    enabled: path !== null && opts.enabled !== false,
    refetchInterval: opts.refetchInterval,
  });
}

/**
 * Mutation with toast + cache invalidation. `invalidate` lists query-key prefixes to refresh after success,
 * so related modules (dashboard, analytics, gamification) stay consistent.
 */
export function useMut<TVars = void, TRes = unknown>(
  fn: (v: TVars) => Promise<TRes>,
  { invalidate = [], success, onSuccess }: { invalidate?: QueryKey[]; success?: string; onSuccess?: (r: TRes, v: TVars) => void } = {},
) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation<TRes, ApiError, TVars>({
    mutationFn: fn,
    onSuccess: (r, v) => {
      for (const k of [...invalidate, ["dashboard"], ["gamification"]]) qc.invalidateQueries({ queryKey: k });
      if (success) toast(success);
      onSuccess?.(r, v);
    },
    onError: (e) => toast(e.message || "Ошибка", "error"),
  });
}
