export type PageSlice<T> = {
  items: T[];
  total: number;
  totalPages: number;
  page: number;
  start: number;
};

export function pageSlice<T>(items: T[], page: number, pageSize = 20): PageSlice<T> {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total,
    totalPages,
    page: safePage,
    start,
  };
}
