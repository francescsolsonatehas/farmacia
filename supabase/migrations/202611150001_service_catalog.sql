-- Detailed service requests from the public service catalog.
alter table public.appointment_requests
  add column if not exists service_detail text;

alter table public.appointment_requests
  alter column preferred_date drop not null;

alter table public.appointment_requests
  drop constraint if exists appointment_requests_service_detail_check;

alter table public.appointment_requests
  add constraint appointment_requests_service_detail_check
  check (service_detail is null or service_detail in (
    'dermo', 'nutrition', 'pharmacy', 'family', 'blood_pressure', 'health_tests',
    'lice_check', 'spd', 'mobility', 'wheelchair', 'aesthetics', 'pets'
  ));
