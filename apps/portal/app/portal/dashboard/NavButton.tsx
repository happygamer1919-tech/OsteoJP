import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import type { ComponentProps } from 'react'
import type { ButtonVariant } from '@osteojp/ui'

// Class strings mirror packages/ui/src/components/Button.tsx exactly.
// NavButton renders a Next.js Link so navigation actions carry role="link"
// instead of role="button", fixing WCAG SC 4.1.2 (Name, Role, Value).
// buttonVariants is not exported from @osteojp/ui, so the strings are
// reproduced here and must be kept in sync with Button.tsx when the
// design system changes.
const BASE =
  'relative inline-flex items-center justify-center gap-2 rounded font-semibold ' +
  'whitespace-nowrap select-none align-middle transition-colors duration-fast ease-standard ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent-2-700 text-text-inverse hover:bg-accent-2-800 active:bg-accent-2-900',
  secondary:
    'bg-surface text-text-primary border border-border-strong hover:bg-surface-muted active:bg-neutral-200',
  ghost:
    'bg-transparent text-text-secondary hover:bg-surface-muted hover:text-text-primary active:bg-neutral-200',
  destructive: 'bg-error text-text-inverse hover:bg-error-800 active:bg-error-900',
}

// All current call sites use the default md size; matches Button SIZES.md.
const SIZE_MD = 'h-10 px-4 text-sm'

interface NavButtonProps extends Omit<ComponentProps<typeof Link>, 'href'> {
  href: string
  variant?: ButtonVariant
  iconLeft?: LucideIcon
}

export function NavButton({
  href,
  variant = 'primary',
  iconLeft: IconLeft,
  children,
  className,
  ...rest
}: NavButtonProps) {
  return (
    <Link
      href={href}
      className={[BASE, VARIANTS[variant], SIZE_MD, className].filter(Boolean).join(' ')}
      {...rest}
    >
      {IconLeft && <IconLeft size={20} strokeWidth={1.75} aria-hidden="true" />}
      {children}
    </Link>
  )
}
