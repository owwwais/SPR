import { Skeleton } from "@/components/ui/skeleton";

export default function TrackLoading() {
  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-40" />
      </div>
      <Skeleton className="h-20 w-full rounded-lg" />
      <Skeleton className="h-40 w-full rounded-lg" />
    </section>
  );
}
