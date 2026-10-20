import { Button } from "@osteojp/ui";
import { s } from "@/lib/i18n";
import { adminLabel } from "../admin-ui";
import { setTherapistServicesAction } from "./actions";

/**
 * Q-M (owner ruling, 2026-10-20): the services a therapist delivers, ticked in
 * the Equipa "Serviço principal" section, below the primary select.
 *
 * The patient app offers and assigns a therapist only for a service ticked here
 * (one `therapist_services` row each). The PRIMARY is the row the staff agenda
 * preselects, so it is shown ticked and DISABLED: it moves only through the
 * primary select above, and the server keeps it whatever this form posts. A
 * disabled checkbox is not submitted, which is exactly right: the server never
 * reads the primary from this form.
 *
 * With no primary yet the list is not offered at all: the primary is chosen
 * deliberately first, never inferred from the order of a checkbox list.
 */
export function TherapistServicesFields({
  therapistId,
  services,
  primaryId,
  mappedServiceIds,
}: {
  therapistId: string;
  /** Active tenant services, the same list the primary select offers. */
  services: { id: string; name: string }[];
  /** The therapist's primary (earliest mapping), or "" when none is set. */
  primaryId: string;
  /** Every service the therapist is mapped to, primary included. */
  mappedServiceIds: string[];
}) {
  const mapped = new Set(mappedServiceIds);
  return (
    <form
      action={setTherapistServicesAction}
      className="flex flex-col gap-2"
      data-testid="therapist-services-form"
    >
      <input type="hidden" name="therapistId" value={therapistId} />
      <span className={adminLabel}>{s["admin.staff.servicesProvided"]}</span>
      <p className="text-xs text-v2-text-secondary">{s["admin.staff.servicesPortalHelp"]}</p>
      {primaryId === "" ? (
        <p className="text-sm text-v2-text-secondary">{s["admin.staff.servicesNeedPrimary"]}</p>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            {services.map((svc) => {
              const isPrimary = svc.id === primaryId;
              return (
                <label key={svc.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="serviceIds"
                    value={svc.id}
                    defaultChecked={isPrimary || mapped.has(svc.id)}
                    disabled={isPrimary}
                    aria-label={svc.name}
                  />
                  <span className="text-sm text-v2-text-primary">{svc.name}</span>
                  {isPrimary && (
                    <span className="text-xs text-v2-text-secondary">
                      ({s["admin.staff.primaryTag"]})
                    </span>
                  )}
                </label>
              );
            })}
          </div>
          <div>
            <Button type="submit" variant="primary" size="sm">
              {s["common.save"]}
            </Button>
          </div>
        </>
      )}
    </form>
  );
}
