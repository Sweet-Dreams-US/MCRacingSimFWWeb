'use client'

// Standalone category filter for the expenses list. Lives next to the shared
// TransactionFilters bar so the category dropdown can be wider and labeled.
import { useRouter, useSearchParams } from 'next/navigation'

interface ExpenseCategoryFilterProps {
  categories: { id: string; name: string }[]
  initialCategoryId: string
}

export default function ExpenseCategoryFilter({
  categories,
  initialCategoryId,
}: ExpenseCategoryFilterProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function update(id: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (id) params.set('categoryId', id)
    else params.delete('categoryId')
    params.delete('page')
    router.replace(`?${params.toString()}`)
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
      <label
        htmlFor="categoryId"
        className="telemetry-text text-xs text-pit-gray uppercase tracking-wider"
      >
        Category:
      </label>
      <select
        id="categoryId"
        value={initialCategoryId}
        onChange={(e) => update(e.target.value)}
        className="bg-asphalt-dark border border-white/10 text-grid-white telemetry-text text-sm px-3 py-2 focus:border-telemetry-cyan focus:outline-none sm:max-w-xs"
      >
        <option value="">All Categories</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  )
}
