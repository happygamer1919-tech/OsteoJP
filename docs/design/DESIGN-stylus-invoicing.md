# Design note: posting paid visits to Stylus (roadmap 10)

Status: DESIGN ONLY. No code path to Stylus exists. No write to Stylus is allowed until Stylus confirms in writing that a write made with the demo key is not a real fiscal document and is not reported to the AT (rule S8 below). Written 2026-10-25 from Stylus's answers of 2026-10-25 and a read-only probe of the demo account the same day.

## 1. The rulings this design follows (strategy, 2026-10-25)

- **S1. Stylus stays the fiscal system.** The platform never numbers a document, never picks a document type, never issues a receipt or a credit note.
- **S2. What is posted automatically:** a single-service visit at estado Concluida that is FULLY paid in the platform. Nothing else. Excluded, and listed for reception to handle in Stylus by hand:
  - unpaid or part-paid visits;
  - sessions consumed from a pacote, and pacote sales;
  - insurer visits;
  - any change or cancellation after posting (credit note in Stylus, by hand).
- **S3. Mapping:** one Stylus SKU per platform service, in a mapping table. The order carries the price actually charged. The VAT rate per line follows Stylus's answer to question 7 of our email (open, see section 6).
- **S4. Billing block:** `pais` is always `PT`. Every other field is sent only when the patient record holds it. The NIF is sent only when present and valid.
- **S5. Idempotency:** `id_encomenda_shopify` is our charge id. Our side keeps a posting ledger with a unique constraint and never posts again a charge that already has a Stylus id. A timeout whose outcome is unknown is marked "verificar no Stylus" for reception, with NO automatic retry until Stylus answers on duplicates.
- **S6.** One request at a time, backoff on errors, and a capped number of polls for the invoice PDF.
- **S7. Keys:** the production key lives only in Vercel, typed there by the owner. The demo key is kept outside the repository.
- **S8. Test access is read-only:** health, connection diagnostic, products, stock. No POST until Stylus confirms in writing (see the status line above).

## 2. What Stylus told us (2026-10-25)

- Invoicing is automatic on their side. Stylus chooses the document type (FT, FS, NC).
- VAT exemption codes live on the Stylus article (the SKU), not on our order.
- Late payments, receipts, cancellations and credit notes are manual in Stylus.
- There is no listing endpoint for orders and no webhooks. We learn the outcome only from the response to our own request and from the invoice endpoint for that order.
- `morada_envio` is optional. `morada_faturacao` needs only `pais`.
- Only single services are articles in the shop. Packs are managed by hand on the Stylus client card.
- One document series (1E) for all clinics. Stylus separates sales by posto for its reports. One price per service in Stylus, but the price on our order is respected.
- Insurer invoices are manual, with a third-party NIF.
- No rate limit. Use it responsibly.

## 3. The API as probed (demo account, GET only, 2026-10-25)

Base URL `https://api.styluson.pt`. Authentication: a bearer key plus an `X-Filial` header. Every response is JSON with an `ok` boolean.

| Endpoint | Auth | Result | Shape (field names only) |
|---|---|---|---|
| `GET /v1/health` | none | 200, about 0.6 s | `ok`, `service`, `version`, `php`, `host` |
| `GET /v1/diagnostico/ligacao` | key | 200, about 0.3 s | `ok`, `ligacao{host, base_dados, filial, filial_catalogo, artigos_online, read_only}` |
| `GET /v1/produtos?idioma=pt&limit=N` | key | 200, about 0.35 s | `ok`, `filial`, `filial_catalogo`, `idioma`, `moeda`, `produtos[]{sku, nome, descricao_completa, descricao_curta, categoria, subcategoria, marca, codigo_barras, ativo_loja_online, preco_venda, taxa_iva, moeda, data_atualizacao, novidade, niveis_preco[]{nivel, preco_com_iva}}`, `has_more`, `next_updated_since` |
| `GET /v1/stock?limit=N` | key | 200, about 0.4 s | `ok`, `filial`, `filial_catalogo`, `filiais_stock[]`, `stock[]{sku, quantidade_disponivel, data_atualizacao}`, `has_more`, `next_sku` |
| `POST /v1/encomendas` | key | NOT CALLED (S8) | per the collection: the order |
| `GET /v1/encomendas/{id}/fatura` | key | NOT CALLED (no order exists) | the invoice PDF for an order |

What the demo account holds: 25 articles, all in one demo category, all active in the online shop, all priced in EUR, all at `taxa_iva` 23, none with more than one price level. None of them is a clinic service: it is Stylus's demo catalogue, so the SKU mapping (S3) cannot be drafted from it.

**The connection diagnostic reports `read_only: false` for the demo key.** So the demo key is able to write. That is one more reason S8 holds: nothing in this note may POST until Stylus answers in writing.

Pagination: products page by `updated_since` (the response's `next_updated_since`), stock by SKU (`next_sku`). One page of 100 held all 25 demo articles.

## 4. The design

### 4.1 Eligibility (S2), decided at the moment of posting

A visit is posted only when ALL of these hold, read in one transaction:

1. the appointment's status is `completed` (shown as Concluida);
2. it has exactly one service, and that service has a row in the SKU mapping;
3. it is not linked to a pacote instance;
4. it is not an insurer visit;
5. its charge (an `invoices` row) is `paid`, and the amount paid equals the amount charged (fully paid);
6. the charge has no posting row with a Stylus id yet.

Anything that fails 2 to 5 goes on the reception list "Para tratar no Stylus" with the reason, never posted.

### 4.2 The posting ledger (S5)

A new table, one row per charge: tenant, charge id (unique per tenant), state (`pending`, `posted`, `verificar`, `refused`), Stylus order id, invoice reference when known, the request's timestamp, the response code. No request or response body is stored (it carries personal data). The unique constraint is what makes a second post impossible. A migration, so Tier C, with its own isolation test.

- `posted`: the Stylus response gave an order id.
- `verificar`: a timeout or a 5xx whose outcome is unknown. Reception checks in Stylus and closes it by hand. No automatic retry (S5) until Stylus says whether a repeated `id_encomenda_shopify` is refused or creates a second document.
- `refused`: a 4xx. Reception sees the reason code, never the body.

### 4.3 The order (S3, S4)

- `id_encomenda_shopify`: the charge id.
- One line: the mapped SKU, quantity 1, the price actually charged. The VAT rate per line follows question 7 (section 6). Until it is answered, the line carries no rate of its own, and Stylus applies the article's.
- `morada_faturacao`: `pais: "PT"` always. Name, address, postal code and city only when the patient record holds them. NIF only when present and valid (the platform's existing NIF check). A patient marked NIF-exempt gets no NIF.
- `morada_envio`: omitted.
- Posto: the visit's clinic, if Stylus's order accepts one (open, section 6).

### 4.4 The calls (S6)

- One request in flight per tenant. Backoff 2 s, 4 s, 8 s on 429 or connection errors before the request is sent. Once a POST may have reached Stylus, the outcome is `verificar`, never a retry.
- Invoice PDF: poll `GET /v1/encomendas/{id}/fatura` at most 5 times over 10 minutes, then leave it for reception.
- The job runs as a background function. Turning it on is its own switch, off by default.

### 4.5 Keys (S7)

- Production: `STYLUS_API_KEY` and `STYLUS_FILIAL` in Vercel production only, typed by the owner. Never in the repository, a log, Sentry, an audit row or a test fixture.
- Tests in CI use a fake server. No CI job calls Stylus.

## 5. What reception still does in Stylus by hand

Late payments and receipts, cancellations and credit notes, pacote sales and pacote sessions, insurer invoices (third-party NIF), and every row on the "Para tratar no Stylus" and "verificar" lists.

## 6. Open questions to Stylus (blocking a write path)

1. **S8:** confirm in writing that orders posted with the demo key are not real fiscal documents and are not reported to the AT. The demo key reports `read_only: false`.
2. **Duplicates:** what happens when the same `id_encomenda_shopify` is posted twice: refused, ignored, or a second document?
3. **Question 7, VAT per line:** does the line's VAT come only from the article's exemption code, or may the order carry a rate? Health services are often exempt; the demo articles all show 23.
4. **Posto:** how does an order say which clinic (posto) it belongs to, given one series for all clinics?
5. **Timeout outcome:** is there any read that tells us whether an order exists, given there is no listing endpoint (the invoice endpoint for an id we never received cannot help)?

## 7. Next steps

1. Stylus answers section 6.
2. The owner gives the SKU for each platform service (the mapping, S3).
3. Then the build, in this order: the ledger migration (Tier C), the eligibility read and the reception list (no Stylus call), then the posting job behind its switch, tested against a fake server only.
