create table if not exists public.director_takes (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  status text not null check (status in ('Uploading', 'Processing', 'Ready', 'Error')),
  width integer not null default 512,
  height integer not null default 288,
  fps integer not null default 12,
  duration_seconds double precision not null default 0,
  frame_count integer not null default 0,
  manifest_path text not null,
  video_path text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.director_takes enable row level security;

drop policy if exists "Users read own director takes" on public.director_takes;
create policy "Users read own director takes"
  on public.director_takes for select
  using (auth.uid() = user_id);

drop policy if exists "Users create own director takes" on public.director_takes;
create policy "Users create own director takes"
  on public.director_takes for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own director takes" on public.director_takes;
create policy "Users update own director takes"
  on public.director_takes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('director-takes', 'director-takes', false)
on conflict (id) do update set public = false;

drop policy if exists "Users read own director take files" on storage.objects;
create policy "Users read own director take files"
  on storage.objects for select
  using (
    bucket_id = 'director-takes'
    and (storage.foldername(name))[1] = 'users'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "Users upload own director take files" on storage.objects;
create policy "Users upload own director take files"
  on storage.objects for insert
  with check (
    bucket_id = 'director-takes'
    and (storage.foldername(name))[1] = 'users'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "Users replace own director take files" on storage.objects;
create policy "Users replace own director take files"
  on storage.objects for update
  using (
    bucket_id = 'director-takes'
    and (storage.foldername(name))[1] = 'users'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create index if not exists director_takes_user_created_idx
  on public.director_takes (user_id, created_at desc);
