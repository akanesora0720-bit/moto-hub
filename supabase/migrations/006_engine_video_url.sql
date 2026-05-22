-- エンジン稼働動画（外部URL・任意・運営が登録）

alter table public.listings
  add column if not exists engine_video_url text;
