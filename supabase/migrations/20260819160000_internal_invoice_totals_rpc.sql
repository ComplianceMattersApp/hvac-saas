-- Collapse invoice subtotal/tax/total recomputation into one database round trip.
--
-- The function is SECURITY INVOKER on purpose: callers retain the same RLS and
-- table privileges as the existing PostgREST reads/writes. The application
-- keeps its legacy multi-query implementation as a deployment-order fallback
-- until this function is present in PostgREST's schema cache.

begin;

create or replace function public.recalculate_internal_invoice_totals_v1(
  p_invoice_id uuid,
  p_updated_by_user_id uuid
)
returns table (
  subtotal_cents integer,
  tax_cents integer,
  total_cents integer
)
language sql
volatile
security invoker
set search_path = public, pg_temp
as $$
  with invoice_context as (
    select
      invoice.id,
      invoice.tax_rate_percent,
      coalesce(customer.tax_exempt, false) as customer_tax_exempt
    from public.internal_invoices as invoice
    left join public.customers as customer
      on customer.id = invoice.customer_id
    where invoice.id = p_invoice_id
  ),
  line_totals as (
    select
      context.id as invoice_id,
      coalesce(sum(round(line.line_subtotal * 100)), 0)::bigint as subtotal_cents,
      coalesce(
        sum(
          case
            when line.is_taxable then round(line.line_subtotal * 100)
            else 0
          end
        ),
        0
      )::bigint as taxable_subtotal_cents,
      context.tax_rate_percent,
      context.customer_tax_exempt
    from invoice_context as context
    left join public.internal_invoice_line_items as line
      on line.invoice_id = context.id
    group by context.id, context.tax_rate_percent, context.customer_tax_exempt
  ),
  computed as (
    select
      invoice_id,
      subtotal_cents,
      case
        when tax_rate_percent is null or customer_tax_exempt then 0::bigint
        else round(taxable_subtotal_cents * tax_rate_percent / 100)::bigint
      end as tax_cents
    from line_totals
  ),
  updated as (
    update public.internal_invoices as invoice
    set
      subtotal_cents = computed.subtotal_cents::integer,
      tax_cents = computed.tax_cents::integer,
      total_cents = (computed.subtotal_cents + computed.tax_cents)::integer,
      updated_by_user_id = p_updated_by_user_id,
      updated_at = now()
    from computed
    where invoice.id = computed.invoice_id
    returning invoice.subtotal_cents, invoice.tax_cents, invoice.total_cents
  )
  select updated.subtotal_cents, updated.tax_cents, updated.total_cents
  from updated;
$$;

comment on function public.recalculate_internal_invoice_totals_v1(uuid, uuid) is
  'Atomically recomputes invoice subtotal, sales tax, and total from current line items in one database round trip.';

revoke all on function public.recalculate_internal_invoice_totals_v1(uuid, uuid) from public;
grant execute on function public.recalculate_internal_invoice_totals_v1(uuid, uuid) to authenticated;
grant execute on function public.recalculate_internal_invoice_totals_v1(uuid, uuid) to service_role;

commit;
