-- 初回管理者に昇格（メールを自分のものに変更）
update public.profiles
set is_admin = true, trust_score = 100, trust_rank = 'GOLD', profile_completed = true
where email = 'admin@example.com';
