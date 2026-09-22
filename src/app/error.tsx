"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="page-title">Something went wrong</h1>
      <p className="mt-2 text-muted">Please try again.</p>
      <button type="button" className="btn-primary mt-6" onClick={reset}>Try again</button>
    </div>
  );
}
