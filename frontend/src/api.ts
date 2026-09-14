let csrfToken = ''

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function setCsrfToken(token: string) {
  csrfToken = token
}

export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

  const data = await response.json()
  if (!response.ok) throw new ApiError(data.error || 'Request failed.', response.status)
  return data
}
