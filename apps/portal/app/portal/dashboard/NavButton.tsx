'use client'

import { Button, type ButtonProps } from '@osteojp/ui'
import { useRouter } from 'next/navigation'

/**
 * A shared Button that navigates on click. The @osteojp/ui Button has no href
 * passthrough (SPEC-foundation §4.1), so this thin client wrapper keeps the
 * design-system button look for the dashboard's navigation actions (SPEC-portal
 * §5.2 hero buttons, §5 empty-state primary) without re-encoding its styling.
 */
export function NavButton({ href, ...props }: { href: string } & ButtonProps) {
  const router = useRouter()
  return <Button {...props} onClick={() => router.push(href)} />
}
