"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-rm-canvas px-6 text-rm-ink">
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="max-w-md text-center text-sm opacity-70">{error.message}</p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-md bg-rm-actions px-4 py-2 text-sm text-rm-actions-fg"
      >
        Try again
      </button>
    </div>
  );
}
