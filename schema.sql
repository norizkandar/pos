-- EONIX POS DATABASE — Supabase SQL Editor
-- Run once in a new Supabase project. Uses Supabase Auth + Postgres + RLS.
create extension if not exists pgcrypto;

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'My Business',
  email text,
  currency text not null default 'MYR' check (currency in ('MYR','USD','SGD')),
  created_at timestamptz not null default now()
);

create table if not exists public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'staff' check (role in ('owner','manager','cashier')),
  created_at timestamptz not null default now(),
  unique(business_id,user_id)
);

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  name text not null,
  sku text,
  category text,
  price numeric(12,2) not null default 0 check(price >= 0),
  stock_quantity integer not null default 0 check(stock_quantity >= 0),
  low_stock_threshold integer not null default 5 check(low_stock_threshold >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_id,sku)
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  receipt_number text not null default ('POS-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  subtotal numeric(12,2) not null check(subtotal >= 0),
  discount numeric(12,2) not null default 0 check(discount >= 0),
  total numeric(12,2) not null check(total >= 0),
  payment_method text not null default 'cash' check(payment_method in ('cash','bank_transfer','card_external','other')),
  status text not null default 'completed' check(status in ('completed','voided','refunded')),
  created_at timestamptz not null default now()
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  sku text,
  unit_price numeric(12,2) not null check(unit_price >= 0),
  quantity integer not null check(quantity > 0),
  line_total numeric(12,2) not null check(line_total >= 0)
);

create index if not exists products_business_idx on public.products(business_id);
create index if not exists sales_business_created_idx on public.sales(business_id,created_at desc);
create index if not exists customers_business_idx on public.customers(business_id);
create index if not exists sale_items_sale_idx on public.sale_items(sale_id);

create or replace function public.is_business_member(target_business uuid)
returns boolean language sql stable security definer set search_path=public
as $$
  select exists(select 1 from public.businesses b where b.id=target_business and b.owner_id=auth.uid())
  or exists(select 1 from public.business_members m where m.business_id=target_business and m.user_id=auth.uid());
$$;

alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.branches enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;

drop policy if exists "business owner reads own business" on public.businesses;
create policy "business owner reads own business" on public.businesses for select to authenticated using(owner_id=auth.uid());
drop policy if exists "business owner creates own business" on public.businesses;
create policy "business owner creates own business" on public.businesses for insert to authenticated with check(owner_id=auth.uid());
drop policy if exists "business owner updates own business" on public.businesses;
create policy "business owner updates own business" on public.businesses for update to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());

drop policy if exists "members can read memberships" on public.business_members;
create policy "members can read memberships" on public.business_members for select to authenticated using(user_id=auth.uid() or public.is_business_member(business_id));
drop policy if exists "owner manages memberships" on public.business_members;
create policy "owner manages memberships" on public.business_members for all to authenticated using(exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid())) with check(exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid()));

drop policy if exists "members access branches" on public.branches;
create policy "members access branches" on public.branches for all to authenticated using(public.is_business_member(business_id)) with check(public.is_business_member(business_id));
drop policy if exists "members access products" on public.products;
create policy "members access products" on public.products for all to authenticated using(public.is_business_member(business_id)) with check(public.is_business_member(business_id));
drop policy if exists "members access customers" on public.customers;
create policy "members access customers" on public.customers for all to authenticated using(public.is_business_member(business_id)) with check(public.is_business_member(business_id));
drop policy if exists "members access sales" on public.sales;
create policy "members access sales" on public.sales for all to authenticated using(public.is_business_member(business_id)) with check(public.is_business_member(business_id));
drop policy if exists "members access sale items" on public.sale_items;
create policy "members access sale items" on public.sale_items for all to authenticated
using(exists(select 1 from public.sales s where s.id=sale_id and public.is_business_member(s.business_id)))
with check(exists(select 1 from public.sales s where s.id=sale_id and public.is_business_member(s.business_id)));

-- Important: the browser starter creates a sale and updates stock as separate requests.
-- For production use, replace checkout with a Postgres RPC/Edge Function transaction that
-- validates prices/stock and inserts sale + items + stock deductions atomically.
