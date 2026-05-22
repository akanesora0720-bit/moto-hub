-- 出品時の車両評価（7項目）・車検残

alter table public.listings
  add column if not exists grade_total int check (grade_total is null or (grade_total >= 1 and grade_total <= 10)),
  add column if not exists grade_engine int check (grade_engine is null or (grade_engine >= 1 and grade_engine <= 10)),
  add column if not exists grade_front int check (grade_front is null or (grade_front >= 1 and grade_front <= 10)),
  add column if not exists grade_exterior int check (grade_exterior is null or (grade_exterior >= 1 and grade_exterior <= 10)),
  add column if not exists grade_rear int check (grade_rear is null or (grade_rear >= 1 and grade_rear <= 10)),
  add column if not exists grade_electrical int check (grade_electrical is null or (grade_electrical >= 1 and grade_electrical <= 10)),
  add column if not exists grade_frame int check (grade_frame is null or (grade_frame >= 1 and grade_frame <= 10)),
  add column if not exists inspection_remaining text;
