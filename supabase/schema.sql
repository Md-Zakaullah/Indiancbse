-- Northstar School OS: Supabase Postgres schema with per-school row-level security.
-- Run the entire file in Supabase Dashboard > SQL Editor as the project owner.
create extension if not exists pgcrypto;

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 160),
  board text not null default 'CBSE',
  created_at timestamptz not null default now()
);
create table if not exists public.school_members (
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin','staff')),
  created_at timestamptz not null default now(),
  primary key (school_id,user_id),
  unique (user_id)
);
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  name text not null, admission_no text not null, class_name text not null, guardian_name text not null, phone text not null,
  status text not null default 'Active' check(status in ('Active','Pending','On leave')),
  created_at timestamptz not null default now(), unique(school_id,admission_no)
);
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade, attendance_date date not null default current_date,
  status text not null check(status in ('Present','Absent','Late')), remarks text not null default '', created_at timestamptz not null default now(),
  unique(student_id,attendance_date)
);
create table if not exists public.exam_results (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade, subject text not null, assessment text not null,
  marks_obtained numeric(7,2) not null check(marks_obtained>=0), maximum_marks numeric(7,2) not null check(maximum_marks>0 and marks_obtained<=maximum_marks),
  created_at timestamptz not null default now()
);
create table if not exists public.fee_records (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade, fee_type text not null, due_date date not null,
  amount numeric(12,2) not null check(amount>=0), status text not null check(status in ('Paid','Pending')), created_at timestamptz not null default now()
);
create table if not exists public.hostel_allocations (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null unique references public.students(id) on delete cascade, hostel_name text not null check(hostel_name in ('Boys'' Hostel','Girls'' Hostel')),
  wing text not null, room_number text not null, bed_label text not null, status text not null default 'Boarding' check(status in ('Boarding','On leave')),
  created_at timestamptz not null default now()
);
create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  name text not null, employee_no text not null, role text not null, department text not null, phone text not null,
  status text not null default 'On duty' check(status in ('On duty','On leave')), created_at timestamptz not null default now(), unique(school_id,employee_no)
);
create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  title text not null, category text not null check(category in ('Academic','Event','Hostel','General')), event_date date not null, body text not null,
  created_at timestamptz not null default now()
);

create or replace function public.is_school_member(target_school uuid)
returns boolean language sql stable security definer set search_path=public,auth
as $$ select exists(select 1 from public.school_members where school_id=target_school and user_id=auth.uid()); $$;
revoke all on function public.is_school_member(uuid) from public;
grant execute on function public.is_school_member(uuid) to authenticated;

create or replace function public.create_school(school_name text, school_board text default 'CBSE')
returns uuid language plpgsql security definer set search_path=public,auth
as $$
declare new_school_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  if length(trim(school_name)) < 2 or length(trim(school_name)) > 160 then raise exception 'School name must be between 2 and 160 characters'; end if;
  if exists(select 1 from public.school_members where user_id=auth.uid()) then raise exception 'This account already has a school workspace'; end if;
  insert into public.schools(name,board) values(trim(school_name),coalesce(nullif(trim(school_board),''),'CBSE')) returning id into new_school_id;
  insert into public.school_members(school_id,user_id,role) values(new_school_id,auth.uid(),'admin');
  return new_school_id;
end; $$;
revoke all on function public.create_school(text,text) from public;
grant execute on function public.create_school(text,text) to authenticated;

alter table public.schools enable row level security;
alter table public.school_members enable row level security;
create policy "Members read their school" on public.schools for select to authenticated using (public.is_school_member(id));
create policy "Members read school membership" on public.school_members for select to authenticated using (user_id=auth.uid());

do $$ declare tbl text; begin
  foreach tbl in array array['students','attendance','exam_results','fee_records','hostel_allocations','staff','notices'] loop
    execute format('alter table public.%I enable row level security',tbl);
    execute format('create policy "School members read %1$I" on public.%1$I for select to authenticated using (public.is_school_member(school_id))',tbl);
    execute format('create policy "School members insert %1$I" on public.%1$I for insert to authenticated with check (public.is_school_member(school_id))',tbl);
    execute format('create policy "School members update %1$I" on public.%1$I for update to authenticated using (public.is_school_member(school_id)) with check (public.is_school_member(school_id))',tbl);
    execute format('create policy "School members delete %1$I" on public.%1$I for delete to authenticated using (public.is_school_member(school_id))',tbl);
    execute format('grant select,insert,update,delete on public.%I to authenticated',tbl);
  end loop;
end $$;
grant select on public.schools,public.school_members to authenticated;
create index if not exists students_school_created_idx on public.students(school_id,created_at desc);
create index if not exists attendance_school_date_idx on public.attendance(school_id,attendance_date desc);
create index if not exists exams_school_created_idx on public.exam_results(school_id,created_at desc);
create index if not exists fees_school_created_idx on public.fee_records(school_id,created_at desc);
create index if not exists hostel_school_created_idx on public.hostel_allocations(school_id,created_at desc);
create index if not exists staff_school_created_idx on public.staff(school_id,created_at desc);
create index if not exists notices_school_event_idx on public.notices(school_id,event_date);
