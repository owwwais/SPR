import { Skeleton } from "@/components/ui/skeleton";

// Segment-level fallback: any /admin route without its own loading.tsx
// (dashboard home, calendar, settings, …) shows this instantly on
// navigation instead of appearing unresponsive.
export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}
