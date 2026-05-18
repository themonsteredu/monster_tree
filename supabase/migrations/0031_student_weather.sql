-- 학생별 마당 날씨/분위기 효과 — Phase 2.
-- 한 학생당 1행. weather_type 은 코드의 WEATHER_TYPES 와 1:1.

create table if not exists public.student_weather_setting (
  student_id uuid primary key references public.garden_students(id) on delete cascade,
  weather_type text not null default 'none' check (
    weather_type in (
      'none', 'rain', 'snow', 'cherry_blossom',
      'sunshine', 'firefly', 'stars', 'autumn_leaves'
    )
  ),
  updated_at timestamptz not null default now()
);

alter table public.student_weather_setting enable row level security;
-- service_role 만 쓰기/읽기 — 학생 측 변경은 Server Action 으로 본인 student_id 매칭 확인 후 처리.
-- (정책 없음 = anon 차단; service_role 은 RLS 우회)
