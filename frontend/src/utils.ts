import type { FormEvent } from 'react'
import type { Snapshot } from './types'

export const EMPTY_SNAPSHOT: Snapshot = {
  jobs: [],
  applications: [],
  companies: [],
  saved: [],
  students: [],
}

export const APPLICATION_TRANSITIONS: Record<string, string[]> = {
  'Under review': ['Shortlisted', 'Rejected'],
  Shortlisted: ['Interview scheduled', 'Selected', 'Rejected'],
  'Interview scheduled': ['Interview scheduled', 'Selected', 'Rejected'],
  Selected: [],
  Rejected: [],
  Withdrawn: [],
}

export function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function getInitials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function getFormValues(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
  return Object.fromEntries(new FormData(event.currentTarget).entries())
}
