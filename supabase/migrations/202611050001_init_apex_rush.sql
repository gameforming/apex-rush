-- Apex Rush online profile + safe player-to-player marketplace.
-- Run this migration in the Supabase SQL editor after creating a project.

create extension if not exists pgcrypto;

create table if not exists public.player_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.player_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  credits bigint not null default 12000 check (credits >= 0),
  xp bigint not null default 0 check (xp >= 0),
  races integer not null default 0 check (races >= 0),
  wins integer not null default 0 check (wins >= 0 and wins <= races),
  crates integer not null default 1 check (crates >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.player_cars (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  model_key text not null check (model_key in ('starter', 'coupe', 'rally', 'gt', 'hyper')),
  upgrades jsonb not null default '{"engine":0,"gearbox":0,"brakes":0,"suspension":0}'::jsonb,
  is_listed boolean not null default false,
  acquired_at timestamptz not null default now()
);
create index if not exists player_cars_owner_idx on public.player_cars(owner_id);

create table if not exists public.player_tires (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  tire_type text not null check (tire_type in ('basic', 'medium', 'soft', 'allterrain')),
  sets integer not null default 0 check (sets >= 0),
  updated_at timestamptz not null default now(),
  unique(owner_id, tire_type)
);
create index if not exists player_tires_owner_idx on public.player_tires(owner_id);

create table if not exists public.market_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users(id) on delete restrict,
  buyer_id uuid references auth.users(id) on delete set null,
  item_kind text not null check (item_kind in ('car', 'tire')),
  car_id uuid references public.player_cars(id) on delete restrict,
  tire_type text check (tire_type in ('basic', 'medium', 'soft', 'allterrain')),
  quantity integer not null default 1 check (quantity > 0),
  asking_price bigint not null check (asking_price > 0),
  status text not null default 'open' check (status in ('open', 'sold', 'cancelled')),
  created_at timestamptz not null default now(),
  sold_at timestamptz,
  constraint market_listing_asset_check check (
    (item_kind = 'car' and car_id is not null and tire_type is null and quantity = 1)
    or (item_kind = 'tire' and car_id is null and tire_type is not null)
  )
);
create index if not exists market_listings_open_idx on public.market_listings(status, created_at desc);
create index if not exists market_listings_seller_idx on public.market_listings(seller_id, status);

-- New accounts automatically receive the starter garage and wallet.
create or replace function public.handle_new_apex_rush_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  requested_name text;
begin
  requested_name := coalesce(nullif(trim(new.raw_user_meta_data ->> 'username'), ''), 'Racer_' || left(replace(new.id::text, '-', ''), 8));
  insert into public.player_profiles(user_id, username)
  values (new.id, requested_name)
  on conflict (user_id) do nothing;

  insert into public.player_wallets(user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.player_cars(owner_id, model_key)
  values (new.id, 'starter');

  insert into public.player_tires(owner_id, tire_type, sets)
  values (new.id, 'basic', 3)
  on conflict (owner_id, tire_type) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_apex_rush on auth.users;
create trigger on_auth_user_created_apex_rush
after insert on auth.users
for each row execute procedure public.handle_new_apex_rush_user();

-- Only the owner can read their wallet, cars and tire inventory. No direct
-- client-side write policies are created for economy or marketplace tables.
alter table public.player_profiles enable row level security;
alter table public.player_wallets enable row level security;
alter table public.player_cars enable row level security;
alter table public.player_tires enable row level security;
alter table public.market_listings enable row level security;

drop policy if exists "Profiles are visible to signed-in players" on public.player_profiles;
create policy "Profiles are visible to signed-in players"
on public.player_profiles for select to authenticated using (true);

drop policy if exists "Players can update their own profile" on public.player_profiles;
create policy "Players can update their own profile"
on public.player_profiles for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Players can read their own wallet" on public.player_wallets;
create policy "Players can read their own wallet"
on public.player_wallets for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Players can read their own cars" on public.player_cars;
create policy "Players can read their own cars"
on public.player_cars for select to authenticated using (auth.uid() = owner_id);

drop policy if exists "Players can read their own tires" on public.player_tires;
create policy "Players can read their own tires"
on public.player_tires for select to authenticated using (auth.uid() = owner_id);

drop policy if exists "Open listings and own history are visible" on public.market_listings;
create policy "Open listings and own history are visible"
on public.market_listings for select to authenticated using (status = 'open' or auth.uid() = seller_id or auth.uid() = buyer_id);

-- Listing a car locks that car. Listing tire sets reserves them immediately.
-- All writes are performed inside SECURITY DEFINER RPCs, never by table writes.
create or replace function public.apex_create_listing(
  p_item_kind text,
  p_asset_id uuid,
  p_quantity integer,
  p_asking_price bigint
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_listing_id uuid;
  v_car public.player_cars%rowtype;
  v_tire public.player_tires%rowtype;
begin
  if v_user is null then raise exception 'You must be signed in.'; end if;
  if p_asking_price is null or p_asking_price < 1 then raise exception 'Invalid asking price.'; end if;
  if p_item_kind is null or p_item_kind not in ('car', 'tire') then raise exception 'Unsupported listing type.'; end if;

  if p_item_kind = 'car' then
    if p_quantity is distinct from 1 then raise exception 'A car listing has quantity one.'; end if;
    select * into v_car from public.player_cars
      where id = p_asset_id and owner_id = v_user for update;
    if not found then raise exception 'Car not found in your garage.'; end if;
    if v_car.is_listed then raise exception 'This car is already listed.'; end if;
    update public.player_cars set is_listed = true where id = v_car.id;
    insert into public.market_listings(seller_id, item_kind, car_id, quantity, asking_price)
      values (v_user, 'car', v_car.id, 1, p_asking_price)
      returning id into v_listing_id;
  else
    if p_quantity is null or p_quantity < 1 then raise exception 'Invalid tire quantity.'; end if;
    select * into v_tire from public.player_tires
      where id = p_asset_id and owner_id = v_user for update;
    if not found then raise exception 'Tire stock not found.'; end if;
    if v_tire.sets < p_quantity then raise exception 'Not enough tire sets available.'; end if;
    update public.player_tires set sets = sets - p_quantity, updated_at = now() where id = v_tire.id;
    insert into public.market_listings(seller_id, item_kind, tire_type, quantity, asking_price)
      values (v_user, 'tire', v_tire.tire_type, p_quantity, p_asking_price)
      returning id into v_listing_id;
  end if;
  return v_listing_id;
end;
$$;

-- Purchase is atomic: balances, asset ownership and listing state all change
-- together. The listing row is locked to prevent two buyers winning one item.
create or replace function public.apex_buy_listing(p_listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_buyer uuid := auth.uid();
  v_listing public.market_listings%rowtype;
  v_buyer_credits bigint;
begin
  if v_buyer is null then raise exception 'You must be signed in.'; end if;
  select * into v_listing from public.market_listings where id = p_listing_id for update;
  if not found or v_listing.status <> 'open' then raise exception 'Listing is no longer available.'; end if;
  if v_listing.seller_id = v_buyer then raise exception 'You cannot buy your own listing.'; end if;

  -- Lock both wallets in a stable order to reduce deadlocks during concurrent trades.
  perform 1 from public.player_wallets
    where user_id in (v_buyer, v_listing.seller_id)
    order by user_id
    for update;

  select credits into v_buyer_credits from public.player_wallets where user_id = v_buyer;
  if v_buyer_credits is null or v_buyer_credits < v_listing.asking_price then
    raise exception 'Not enough credits.';
  end if;

  update public.player_wallets
    set credits = credits - v_listing.asking_price, updated_at = now()
    where user_id = v_buyer;
  update public.player_wallets
    set credits = credits + v_listing.asking_price, updated_at = now()
    where user_id = v_listing.seller_id;

  if v_listing.item_kind = 'car' then
    update public.player_cars
      set owner_id = v_buyer, is_listed = false
      where id = v_listing.car_id and owner_id = v_listing.seller_id and is_listed = true;
    if not found then raise exception 'Car ownership changed. Trade cancelled.'; end if;
  else
    insert into public.player_tires(owner_id, tire_type, sets)
      values (v_buyer, v_listing.tire_type, v_listing.quantity)
      on conflict (owner_id, tire_type)
      do update set sets = public.player_tires.sets + excluded.sets, updated_at = now();
  end if;

  update public.market_listings
    set status = 'sold', buyer_id = v_buyer, sold_at = now()
    where id = v_listing.id;

  return jsonb_build_object(
    'listing_id', v_listing.id,
    'item_kind', v_listing.item_kind,
    'quantity', v_listing.quantity,
    'credits_paid', v_listing.asking_price,
    'status', 'sold'
  );
end;
$$;

create or replace function public.apex_cancel_listing(p_listing_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_listing public.market_listings%rowtype;
begin
  if v_user is null then raise exception 'You must be signed in.'; end if;
  select * into v_listing from public.market_listings
    where id = p_listing_id and seller_id = v_user for update;
  if not found or v_listing.status <> 'open' then raise exception 'Listing cannot be cancelled.'; end if;

  if v_listing.item_kind = 'car' then
    update public.player_cars set is_listed = false
      where id = v_listing.car_id and owner_id = v_user;
  else
    insert into public.player_tires(owner_id, tire_type, sets)
      values (v_user, v_listing.tire_type, v_listing.quantity)
      on conflict (owner_id, tire_type)
      do update set sets = public.player_tires.sets + excluded.sets, updated_at = now();
  end if;

  update public.market_listings set status = 'cancelled' where id = v_listing.id;
  return true;
end;
$$;

revoke all on function public.apex_create_listing(text, uuid, integer, bigint) from public;
revoke all on function public.apex_buy_listing(uuid) from public;
revoke all on function public.apex_cancel_listing(uuid) from public;
grant execute on function public.apex_create_listing(text, uuid, integer, bigint) to authenticated;
grant execute on function public.apex_buy_listing(uuid) to authenticated;
grant execute on function public.apex_cancel_listing(uuid) to authenticated;

grant select on public.player_profiles, public.player_wallets, public.player_cars, public.player_tires, public.market_listings to authenticated;
grant update (username) on public.player_profiles to authenticated;

-- No anon/authenticated INSERT, UPDATE or DELETE policies are added for
-- wallets, inventory, cars or listings. Economy-changing actions must go
-- through verified server-side game logic and the marketplace RPC functions.
