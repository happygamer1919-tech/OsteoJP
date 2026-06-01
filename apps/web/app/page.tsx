import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth/context";

// Root route is a dispatcher, not a page. Gate on the verified session (JWT
// claims) so authenticated users land on /dashboard and everyone else goes
// straight to /login — no scaffold, and no /dashboard hop for anonymous users.
export default async function Home() {
  const ctx = await getRequestContext();
  redirect(ctx ? "/dashboard" : "/login");
}
