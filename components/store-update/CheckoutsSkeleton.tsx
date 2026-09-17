'use client'

import { Skeleton } from '@/components/ui'

/** Placeholder branch cards while the directory loads. */
export default function CheckoutsSkeleton() {
  return (
    <div className="space-y-2.5">
      {[0, 1].map((i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-[rgb(var(--border)/.7)]">
          <Skeleton className="h-10 w-full rounded-none" />
          <Skeleton className="mx-3 my-2 h-7 w-[calc(100%-1.5rem)]" />
          <Skeleton className="mx-3 mb-2 h-7 w-[calc(100%-1.5rem)]" />
        </div>
      ))}
    </div>
  )
}
