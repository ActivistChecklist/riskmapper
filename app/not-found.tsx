import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-rm-canvas px-6 text-rm-ink">
      <h2 className="text-lg font-semibold">Page not found</h2>
      <Link
        href="/"
        className="text-sm font-medium text-rm-ink underline underline-offset-4 opacity-80 hover:opacity-100"
      >
        Back to risk matrix
      </Link>
    </div>
  );
}
