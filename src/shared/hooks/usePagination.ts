import { useState, useCallback, useMemo } from "react";
import { DEFAULT_PAGE_SIZE } from "@/shared/services";

interface Options {
  initialPage?: number;
  initialPageSize?: number;
}

export const usePagination = ({ initialPage = 1, initialPageSize = DEFAULT_PAGE_SIZE }: Options = {}) => {
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const reset = useCallback(() => setPage(1), []);

  return useMemo(
    () => ({ page, pageSize, setPage, setPageSize, reset }),
    [page, pageSize, reset]
  );
};
