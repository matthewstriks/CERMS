import { createContext, useContext, useEffect, useState } from 'react'
import type { DependencyList } from 'react'
import type { ClubRepository } from '../../../data/contracts'

export const RepositoryContext = createContext<ClubRepository | null>(null)
export function useRepository(): ClubRepository {
  const repository = useContext(RepositoryContext)
  if (!repository) throw new Error('Repository provider is missing')
  return repository
}
export function useQuery<T>(query: () => Promise<T>, dependencies: DependencyList) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({
    loading: true,
  })
  useEffect(() => {
    let active = true
    setState({ loading: true })
    query()
      .then((data) => {
        if (active) setState({ data, loading: false })
      })
      .catch(() => {
        if (active)
          setState({ error: 'Unable to load this view. Please try again.', loading: false })
      })
    return () => {
      active = false
    }
  }, dependencies)
  return state
}
export function dateLabel(ms: number | null): string {
  return ms === null
    ? 'Not recorded'
    : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(
        ms,
      )
}
export function money(value: number | null): string {
  return value === null
    ? 'Not recorded'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}
