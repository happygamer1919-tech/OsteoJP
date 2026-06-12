import { getMyAppointments } from '@/lib/api/client'
import { AppointmentsView } from './AppointmentsView'
import { isUpcoming } from './status'

export default async function AppointmentsPage() {
  // A hard fetch failure surfaces error.tsx; empty lists are the per-segment
  // empty states inside AppointmentsView.
  const appointments = await getMyAppointments()

  const upcoming = appointments
    .filter((a) => isUpcoming(a.startsAt, a.status))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())

  const past = appointments
    .filter((a) => !isUpcoming(a.startsAt, a.status))
    .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime())

  return <AppointmentsView upcoming={upcoming} past={past} />
}
