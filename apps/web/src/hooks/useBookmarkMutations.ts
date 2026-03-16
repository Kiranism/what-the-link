import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Bookmark, BookmarkListResponse } from "@bookmark/types";
import { deleteBookmark } from "../utils/api";

const QUERY_KEY = ["bookmarks"];

/**
 * Shared optimistic mutation helper for bookmark queries.
 * Handles cancel → snapshot → optimistic update → rollback → invalidate.
 */
function useOptimisticBookmarkMutation<TVariables>(opts: {
  mutationFn: (vars: TVariables) => Promise<unknown>;
  optimisticUpdate: (old: BookmarkListResponse, vars: TVariables) => BookmarkListResponse;
  onSuccess?: () => void;
}) {
  const queryClient = useQueryClient();

  return useMutation<unknown, Error, TVariables, { prev: [unknown, unknown][] }>({
    mutationFn: opts.mutationFn,
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const prev = queryClient.getQueriesData({ queryKey: QUERY_KEY });
      queryClient.setQueriesData({ queryKey: QUERY_KEY }, (old: any) => {
        if (!old?.bookmarks) return old;
        return opts.optimisticUpdate(old, vars);
      });
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        for (const [key, data] of context.prev) {
          queryClient.setQueryData(key as any, data);
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      opts.onSuccess?.();
    },
  });
}

export function useDeleteBookmarkMutation(opts?: { onSuccess?: () => void }) {
  return useOptimisticBookmarkMutation<number>({
    mutationFn: (id) => deleteBookmark(id),
    optimisticUpdate: (old, id) => ({
      ...old,
      bookmarks: old.bookmarks.filter((b: Bookmark) => b.id !== id),
      total: old.total - 1,
    }),
    onSuccess: opts?.onSuccess,
  });
}
