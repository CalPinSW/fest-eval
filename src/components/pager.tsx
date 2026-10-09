import Link from "next/link";

/** "Showing 101–200 of 2,552" with previous/next links that keep other query params. */
export function Pager({
  page,
  pageSize,
  total,
  params,
  noun = "artists",
}: {
  page: number;
  pageSize: number;
  total: number;
  params: Record<string, string>;
  noun?: string;
}) {
  if (total === 0) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const href = (p: number) => {
    const query = new URLSearchParams({ ...params, ...(p > 1 ? { page: String(p) } : {}) });
    if (p <= 1) query.delete("page");
    const qs = query.toString();
    return qs ? `?${qs}` : "?";
  };
  const fmt = (n: number) => n.toLocaleString("en-GB");

  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <p className="text-muted">
        {pages > 1 ? `Showing ${fmt(first)}–${fmt(last)} of ${fmt(total)} ${noun}` : `${fmt(total)} ${noun}`}
      </p>
      {pages > 1 && (
        <div className="flex gap-2">
          {page > 1 ? (
            <Link href={href(page - 1)} className="btn-secondary px-3 py-1.5" rel="prev">
              Previous
            </Link>
          ) : (
            <span className="btn-secondary px-3 py-1.5 opacity-50" aria-disabled>
              Previous
            </span>
          )}
          <span className="self-center text-muted">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link href={href(page + 1)} className="btn-secondary px-3 py-1.5" rel="next">
              Next
            </Link>
          ) : (
            <span className="btn-secondary px-3 py-1.5 opacity-50" aria-disabled>
              Next
            </span>
          )}
        </div>
      )}
    </nav>
  );
}

/** Read a 1-based page number from search params, defaulting to 1. */
export function pageFromParams(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n > 0 ? n : 1;
}
