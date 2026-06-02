import { describe, expect, it, vi } from "vitest";
import { InvoiceXpressClient, type FetchLike } from "./client";
import {
  issueInvoice,
  retrieveInvoice,
  voidInvoice,
  listInvoices,
} from "./operations";
import { InvoiceXpressConfigError } from "./errors";
import { OSTEOJP_FISCAL_PROFILE, SAMPLE_ISSUE_INPUT } from "./fixtures";

/** A client whose single fetch returns the given status/body, call captured. */
function clientReturning(status: number, body: unknown) {
  const fetchImpl = vi.fn<FetchLike>(async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  }));
  const client = new InvoiceXpressClient({
    credentials: { accountName: "osteojp", apiKey: "k" },
    fetchImpl,
  });
  return { client, fetchImpl };
}

function lastCall(fetchImpl: ReturnType<typeof vi.fn>) {
  const [url, init] = fetchImpl.mock.calls.at(-1)!;
  return {
    url: url as string,
    method: (init as { method: string }).method,
    body: (init as { body?: string }).body
      ? JSON.parse((init as { body: string }).body)
      : undefined,
  };
}

describe("issueInvoice", () => {
  it("POSTs the mapped fatura-recibo and returns the issued invoice", async () => {
    const { client, fetchImpl } = clientReturning(201, {
      invoice_receipt: {
        id: 9001,
        status: "sent",
        sequence_number: "FR 2026/1",
        total: "60.00",
        currency: "EUR",
        date: "2026-06-02",
      },
    });

    const result = await issueInvoice(client, OSTEOJP_FISCAL_PROFILE, SAMPLE_ISSUE_INPUT);

    const call = lastCall(fetchImpl);
    expect(call.method).toBe("POST");
    expect(call.url).toContain("/invoice_receipts.json");
    expect(call.body.invoice_receipt.client.fiscal_id).toBe("123456789");
    expect(call.body.invoice_receipt.items[0].tax.name).toBe("IVA23");
    expect(result).toMatchObject({ id: 9001, state: "issued", totalCents: 6000 });
  });

  it("refuses to issue when the tenant has no NIF (tenant-scoped guard)", async () => {
    const { client, fetchImpl } = clientReturning(201, { invoice_receipt: { id: 1 } });
    await expect(
      issueInvoice(client, { ...OSTEOJP_FISCAL_PROFILE, nif: "" }, SAMPLE_ISSUE_INPUT),
    ).rejects.toBeInstanceOf(InvoiceXpressConfigError);
    // Fail-loud BEFORE any network call.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a non-EUR currency in V1", async () => {
    const { client } = clientReturning(201, { invoice_receipt: { id: 1 } });
    await expect(
      issueInvoice(
        client,
        { ...OSTEOJP_FISCAL_PROFILE, currency: "USD" as unknown as "EUR" },
        SAMPLE_ISSUE_INPUT,
      ),
    ).rejects.toBeInstanceOf(InvoiceXpressConfigError);
  });
});

describe("retrieveInvoice", () => {
  it("GETs the document by id", async () => {
    const { client, fetchImpl } = clientReturning(200, {
      invoice_receipt: { id: 9001, status: "settled", total: "60.00" },
    });
    const out = await retrieveInvoice(client, OSTEOJP_FISCAL_PROFILE, 9001);
    const call = lastCall(fetchImpl);
    expect(call.method).toBe("GET");
    expect(call.url).toContain("/invoice_receipts/9001.json");
    expect(out.state).toBe("settled");
  });
});

describe("voidInvoice", () => {
  it("PUTs change-state → canceled with the required reason", async () => {
    const { client, fetchImpl } = clientReturning(200, {
      invoice_receipt: { id: 9001, status: "canceled" },
    });
    const out = await voidInvoice(client, OSTEOJP_FISCAL_PROFILE, 9001, "Erro de faturação");
    const call = lastCall(fetchImpl);
    expect(call.method).toBe("PUT");
    expect(call.url).toContain("/invoice_receipts/9001/change-state.json");
    expect(call.body.invoice_receipt).toEqual({
      state: "canceled",
      message: "Erro de faturação",
    });
    expect(out.state).toBe("canceled");
  });

  it("requires a cancellation reason (PT fiscal rule)", async () => {
    const { client, fetchImpl } = clientReturning(200, {});
    await expect(
      voidInvoice(client, OSTEOJP_FISCAL_PROFILE, 9001, "   "),
    ).rejects.toBeInstanceOf(InvoiceXpressConfigError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns a canceled view when change-state responds empty (204)", async () => {
    const { client } = clientReturning(200, "");
    const out = await voidInvoice(client, OSTEOJP_FISCAL_PROFILE, 9001, "motivo");
    expect(out).toMatchObject({ id: 9001, state: "canceled" });
  });
});

describe("listInvoices", () => {
  it("GETs a page and maps pagination + items", async () => {
    const { client, fetchImpl } = clientReturning(200, {
      invoice_receipts: [
        { id: 1, status: "sent", total: "60.00" },
        { id: 2, status: "settled", total: "75.00" },
      ],
      pagination: { current_page: 1, total_pages: 3, total_entries: 42 },
    });

    const out = await listInvoices(client, OSTEOJP_FISCAL_PROFILE, { page: 1, state: "issued" });

    const call = lastCall(fetchImpl);
    expect(call.method).toBe("GET");
    expect(call.url).toContain("page=1");
    expect(call.url).toContain("status=final"); // "issued" → InvoiceXpress "final"
    expect(out.invoices).toHaveLength(2);
    expect(out.invoices[1]).toMatchObject({ id: 2, state: "settled", totalCents: 7500 });
    expect(out).toMatchObject({ page: 1, totalPages: 3, totalEntries: 42 });
  });

  it("defaults gracefully when the response has no list/pagination", async () => {
    const { client } = clientReturning(200, {});
    const out = await listInvoices(client, OSTEOJP_FISCAL_PROFILE);
    expect(out).toEqual({ invoices: [], page: 1, totalPages: 1, totalEntries: 0 });
  });
});
