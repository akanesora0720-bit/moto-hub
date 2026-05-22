-- 車種区分の追加: 中型・大型・三輪・キッドバイク

alter type public.vehicle_class add value if not exists 'medium';
alter type public.vehicle_class add value if not exists 'large';
alter type public.vehicle_class add value if not exists 'three_wheel';
alter type public.vehicle_class add value if not exists 'kid_bike';
