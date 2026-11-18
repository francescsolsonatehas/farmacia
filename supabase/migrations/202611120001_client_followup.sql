-- Farmàcia Martí client follow-up database.
-- Public intake is performed only by the register-client Edge Function.

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 2 and 120),
  phone text not null check (char_length(phone) between 7 and 24),
  email text not null,
  service_interest text not null check (service_interest in ('pell', 'familia', 'nutricio', 'mascotes')),
  followup_email boolean not null default false,
  followup_sms boolean not null default false,
  marketing_email boolean not null default false,
  marketing_sms boolean not null default false,
  privacy_notice_version text not null,
  privacy_notice_read_at timestamptz not null default now(),
  privacy_consent_at timestamptz not null default now(),
  followup_consent_at timestamptz not null default now(),
  marketing_email_consent_at timestamptz,
  marketing_sms_consent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint clients_email_lowercase check (email = lower(email))
);

create unique index if not exists clients_email_unique on public.clients (email);

create table if not exists public.staff_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.followups (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  service text not null check (service in ('pell', 'familia', 'nutricio', 'mascotes')),
  action_type text not null check (action_type in ('service_followup', 'routine_review', 'appointment_reminder', 'reorder_reminder')),
  due_on date not null,
  channel text not null check (channel in ('email', 'sms')),
  status text not null default 'pending' check (status in ('pending', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users (id)
);

create table if not exists public.appointment_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 2 and 120),
  phone text not null check (char_length(phone) between 7 and 24),
  email text not null,
  service text not null check (service in ('pell', 'familia', 'nutricio', 'mascotes')),
  mode text not null check (mode in ('in_person', 'online')),
  preferred_date date not null,
  preferred_time text not null check (preferred_time in ('morning', 'afternoon', 'any')),
  contact_channel text not null check (contact_channel in ('email', 'phone')),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  confirmed_at timestamptz,
  privacy_notice_version text not null,
  privacy_notice_read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint appointment_confirmation_time check (status <> 'confirmed' or confirmed_at is not null)
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 100),
  description text not null check (char_length(description) between 3 and 500),
  starts_at timestamptz not null,
  location text not null check (char_length(location) between 2 and 160),
  is_published boolean not null default false,
  registration_open boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_signups (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 120),
  email text not null,
  phone text check (phone is null or char_length(phone) between 7 and 24),
  privacy_notice_version text not null,
  privacy_notice_read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint event_signups_email_lowercase check (email = lower(email)),
  constraint event_signups_unique_email unique (event_id, email)
);

create table if not exists public.product_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 2 and 120),
  phone text not null check (char_length(phone) between 7 and 24),
  email text not null,
  product_category text not null check (product_category in ('facial', 'corporal', 'capillar', 'solar', 'bebe', 'mascotes')),
  product_name text not null check (char_length(product_name) between 2 and 120),
  contact_channel text not null check (contact_channel in ('email', 'phone')),
  status text not null default 'pending' check (status in ('pending', 'available', 'unavailable', 'cancelled')),
  privacy_notice_version text not null,
  privacy_notice_read_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.preference_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  requested_email text check (requested_email is null or char_length(requested_email) <= 254),
  requested_phone text check (requested_phone is null or char_length(requested_phone) between 7 and 24),
  withdraw_followup_email boolean not null default false,
  withdraw_followup_sms boolean not null default false,
  withdraw_marketing_email boolean not null default false,
  withdraw_marketing_sms boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'completed', 'rejected')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid references auth.users (id),
  constraint preference_request_has_change check (
    requested_email is not null or requested_phone is not null or withdraw_followup_email
    or withdraw_followup_sms or withdraw_marketing_email or withdraw_marketing_sms
  )
);

alter table public.clients enable row level security;
alter table public.staff_members enable row level security;
alter table public.followups enable row level security;
alter table public.appointment_requests enable row level security;
alter table public.events enable row level security;
alter table public.event_signups enable row level security;
alter table public.product_requests enable row level security;
alter table public.preference_requests enable row level security;

create or replace function public.is_farmacia_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff_members
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_farmacia_staff() from public, anon;
grant execute on function public.is_farmacia_staff() to authenticated;

create policy "staff can read own staff record"
  on public.staff_members for select to authenticated
  using (user_id = (select auth.uid()));

create policy "staff can read clients"
  on public.clients for select to authenticated
  using (public.is_farmacia_staff());

create policy "staff can delete client records"
  on public.clients for delete to authenticated
  using (public.is_farmacia_staff());

revoke insert, update on public.clients from anon, authenticated;
grant update (full_name, phone, email, followup_email, followup_sms, marketing_email, marketing_sms)
  on public.clients to authenticated;

create policy "staff can update communication preferences"
  on public.clients for update to authenticated
  using (public.is_farmacia_staff())
  with check (public.is_farmacia_staff());

create or replace function public.prevent_preference_reactivation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (not old.followup_email and new.followup_email)
    or (not old.followup_sms and new.followup_sms)
    or (not old.marketing_email and new.marketing_email)
    or (not old.marketing_sms and new.marketing_sms) then
    raise exception 'Preferences can only be re-enabled after a fresh client consent';
  end if;
  return new;
end;
$$;

create trigger clients_preference_reactivation_guard
  before update on public.clients
  for each row execute function public.prevent_preference_reactivation();

create policy "staff can read followups"
  on public.followups for select to authenticated
  using (public.is_farmacia_staff());

create policy "staff can create followups for consented channels"
  on public.followups for insert to authenticated
  with check (
    public.is_farmacia_staff()
    and exists (
      select 1 from public.clients c
      where c.id = client_id
        and (
          (channel = 'email' and c.followup_email)
          or (channel = 'sms' and c.followup_sms)
        )
    )
  );

create policy "staff can update followups"
  on public.followups for update to authenticated
  using (public.is_farmacia_staff())
  with check (public.is_farmacia_staff());

create policy "staff can delete followups"
  on public.followups for delete to authenticated
  using (public.is_farmacia_staff());

create policy "staff can read appointment requests"
  on public.appointment_requests for select to authenticated
  using (public.is_farmacia_staff());
create policy "staff can update appointment requests"
  on public.appointment_requests for update to authenticated
  using (public.is_farmacia_staff()) with check (public.is_farmacia_staff());
create policy "staff can delete appointment requests"
  on public.appointment_requests for delete to authenticated
  using (public.is_farmacia_staff());

create policy "public can read open upcoming events"
  on public.events for select to anon, authenticated
  using (is_published and registration_open and starts_at > now());
create policy "staff can read all events"
  on public.events for select to authenticated
  using (public.is_farmacia_staff());
create policy "staff can create events"
  on public.events for insert to authenticated
  with check (public.is_farmacia_staff());
create policy "staff can update events"
  on public.events for update to authenticated
  using (public.is_farmacia_staff()) with check (public.is_farmacia_staff());
create policy "staff can delete events"
  on public.events for delete to authenticated
  using (public.is_farmacia_staff());

create policy "staff can read event signups"
  on public.event_signups for select to authenticated
  using (public.is_farmacia_staff());
create policy "staff can delete event signups"
  on public.event_signups for delete to authenticated
  using (public.is_farmacia_staff());

create policy "staff can read product requests"
  on public.product_requests for select to authenticated
  using (public.is_farmacia_staff());
create policy "staff can update product requests"
  on public.product_requests for update to authenticated
  using (public.is_farmacia_staff()) with check (public.is_farmacia_staff());
create policy "staff can delete product requests"
  on public.product_requests for delete to authenticated
  using (public.is_farmacia_staff());

create policy "staff can read preference requests"
  on public.preference_requests for select to authenticated
  using (public.is_farmacia_staff());
create policy "staff can update preference requests"
  on public.preference_requests for update to authenticated
  using (public.is_farmacia_staff()) with check (public.is_farmacia_staff());
create policy "staff can delete preference requests"
  on public.preference_requests for delete to authenticated
  using (public.is_farmacia_staff());

revoke all on public.clients, public.staff_members, public.followups,
  public.appointment_requests, public.events, public.event_signups,
  public.product_requests, public.preference_requests from anon, authenticated;
grant select, delete on public.clients to authenticated;
grant update (full_name, phone, email, followup_email, followup_sms, marketing_email, marketing_sms)
  on public.clients to authenticated;
grant select on public.staff_members to authenticated;
grant select, insert, delete on public.followups to authenticated;
grant update (status, completed_at) on public.followups to authenticated;
grant select, delete on public.appointment_requests to authenticated;
grant update (status, confirmed_at) on public.appointment_requests to authenticated;
grant select, insert, delete on public.events to authenticated;
grant update (title, description, starts_at, location, is_published, registration_open) on public.events to authenticated;
grant select, delete on public.event_signups to authenticated;
grant select, delete on public.product_requests to authenticated;
grant update (status) on public.product_requests to authenticated;
grant select, delete on public.preference_requests to authenticated;
grant update (status, completed_at) on public.preference_requests to authenticated;
grant select on public.events to anon;
grant usage on schema public to anon, authenticated;
