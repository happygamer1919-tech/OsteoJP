import { getBookableCatalog } from '@/lib/api/client'
import { BookingFlow } from './BookingFlow'

export default async function BookingPage() {
  // A hard catalog fetch failure surfaces error.tsx (ErrorState + retry).
  const catalog = await getBookableCatalog()
  return <BookingFlow locations={catalog.locations} services={catalog.services} />
}
