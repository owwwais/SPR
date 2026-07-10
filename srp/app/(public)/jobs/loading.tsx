import { Skeleton } from "@/components/ui/skeleton";

export default function JobsLoading() {
  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-12">
      <Skeleton className="h-9 w-48" />
      <div className="flex flex-col gap-3 md:flex-row">
        <Skeleton className="h-9 flex-1" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
    </section>
  );
}
