create extension if not exists pgcrypto;

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    username text not null unique,
    created_at timestamptz not null default now()
);

create table if not exists public.user_stats (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null unique references auth.users(id) on delete cascade,
    streak integer not null default 0,
    current_coefficient numeric(6, 3) not null default 0.01,
    updated_at timestamptz not null default now()
);

create table if not exists public.guesses (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    guessed_number integer not null,
    target_number integer not null,
    guessed_row integer not null,
    target_row integer not null,
    guessed_col integer not null,
    target_col integer not null,
    points numeric(4, 2) not null,
    coefficient numeric(6, 3) not null,
    created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, username)
    values (
        new.id,
        coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1))
    );

    insert into public.user_stats (user_id)
    values (new.id);

    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.user_stats enable row level security;
alter table public.guesses enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Users can read own stats" on public.user_stats;
create policy "Users can read own stats"
on public.user_stats
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own stats" on public.user_stats;
create policy "Users can insert own stats"
on public.user_stats
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own stats" on public.user_stats;
create policy "Users can update own stats"
on public.user_stats
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can read own guesses" on public.guesses;
create policy "Users can read own guesses"
on public.guesses
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own guesses" on public.guesses;
create policy "Users can insert own guesses"
on public.guesses
for insert
with check (auth.uid() = user_id);

create index if not exists guesses_user_id_created_at_idx
on public.guesses (user_id, created_at);
