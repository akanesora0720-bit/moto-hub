-- 取引ステータス payout_ready の通知文言（「振込準備」は車両代直接払いと誤解されるため変更）

update public.notification_templates
set
  subject_template = '[MotoHub] 双方確認済み — 取引完了待ち',
  body_template = '買い手・売り手の確認が完了しました。運営が取引を「完了」にします。車両代金の追加振込は不要です。

{{body}}'
where event_type = 'deal.payout_ready';
