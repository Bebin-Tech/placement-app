import { useEffect, useRef, type ReactNode } from 'react'
import { BriefcaseBusiness, X } from 'lucide-react'

interface FieldProps {
  label: string
  name: string
  type?: string
  value?: string | number
  required?: boolean
  maxLength?: number
}

export function Field({
  label,
  name,
  type = 'text',
  value,
  required = true,
  maxLength = 200,
}: FieldProps) {
  const numberConstraints = type === 'number' ? { min: 0, max: 10, step: 0.01 } : {}
  return (
    <label>
      {label}
      <input
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        maxLength={maxLength}
        {...numberConstraints}
      />
    </label>
  )
}

export function StatusBadge({ value }: { value: string }) {
  const tone =
    value === 'Selected'
      ? 'green'
      : value.includes('Interview')
        ? 'blue'
        : value === 'Under review'
          ? 'amber'
          : 'slate'
  return (
    <span className={`status ${tone}`}>
      <i />
      {value}
    </span>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="empty-state">
      <BriefcaseBusiness size={28} />
      <p>{children}</p>
    </div>
  )
}

interface DialogProps {
  title: string
  busy: boolean
  onClose: () => void
  children: ReactNode
}

export function Dialog({ title, busy, onClose, children }: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement
    dialogRef.current?.querySelector<HTMLElement>('input, select, button')?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose()
      if (event.key !== 'Tab') return

      const elements = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input, select, textarea, a[href]',
        ) ?? [],
      )
      const first = elements[0]
      const last = elements.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
  }, [busy, onClose])

  return (
    <div className="modal-backdrop">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className="modal"
      >
        <button disabled={busy} className="modal-close" onClick={onClose} aria-label="Close dialog">
          <X size={18} />
        </button>
        <p className="eyebrow">WORKSPACE</p>
        <h2 id="dialog-title">{title}</h2>
        {children}
      </div>
    </div>
  )
}
