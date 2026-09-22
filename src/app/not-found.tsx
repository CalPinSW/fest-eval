import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="page-title">Not found</h1>
      <p className="mt-2 text-muted">That page doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <Link href="/festivals" className="btn-primary mt-6">Browse festivals</Link>
    </div>
  );
}
