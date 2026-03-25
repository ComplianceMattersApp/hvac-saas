-- Fix customer search to use canonical customer identity
-- Source of truth: customers.full_name with first_name/last_name fallback

create or replace function public.search_customers(
  search_text text,
  result_limit integer default 25
)
returns table(
  customer_id uuid,
  full_name text,
  phone text,
  email text,
  locations_count bigint,
  sample_location_id uuid,
  sample_address text,
  sample_city text
)
language sql
as $$
  with q as (
    select trim(coalesce(search_text, '')) as s,
           regexp_replace(coalesce(search_text, ''), '\\D', '', 'g') as digits
  ),
  matches as (
    select
      c.id as customer_id,
      coalesce(
        nullif(trim(coalesce(c.full_name, '')), ''),
        nullif(
          trim(
            concat_ws(
              ' ',
              nullif(trim(coalesce(c.first_name, '')), ''),
              nullif(trim(coalesce(c.last_name, '')), '')
            )
          ),
          ''
        )
      ) as full_name,
      c.phone,
      c.email,
      l.id as location_id,
      l.address_line1,
      l.city
    from public.customers c
    left join public.locations l
      on l.customer_id = c.id
    cross join q
    where
      q.s <> ''
      and (
        coalesce(
          nullif(trim(coalesce(c.full_name, '')), ''),
          nullif(
            trim(
              concat_ws(
                ' ',
                nullif(trim(coalesce(c.first_name, '')), ''),
                nullif(trim(coalesce(c.last_name, '')), '')
              )
            ),
            ''
          )
        ) ilike '%' || q.s || '%'
        or (q.digits <> '' and regexp_replace(coalesce(c.phone, ''), '\\D', '', 'g') like '%' || q.digits || '%')
        or l.address_line1 ilike '%' || q.s || '%'
        or l.city ilike '%' || q.s || '%'
      )
  ),
  grouped as (
    select
      m.customer_id,
      max(m.full_name) as full_name,
      max(m.phone) as phone,
      max(m.email) as email,
      count(distinct m.location_id) as locations_count
    from matches m
    group by m.customer_id
  ),
  first_location as (
    select distinct on (m.customer_id)
      m.customer_id,
      m.location_id,
      m.address_line1,
      m.city
    from matches m
    where m.location_id is not null
    order by m.customer_id, m.address_line1
  )
  select
    g.customer_id,
    g.full_name,
    g.phone,
    g.email,
    g.locations_count,
    f.location_id as sample_location_id,
    f.address_line1 as sample_address,
    f.city as sample_city
  from grouped g
  left join first_location f
    on f.customer_id = g.customer_id
  order by g.full_name nulls last
  limit result_limit;
$$;
