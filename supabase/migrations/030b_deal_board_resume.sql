-- 030 を途中まで実行済みのとき用（ポリシー重複エラー後の続き）
-- エラー: policy "deal_messages_select" already exists

drop policy if exists deal_messages_select on public.deal_messages;
drop policy if exists deal_message_reads_select on public.deal_message_reads;
drop policy if exists deal_message_reads_upsert on public.deal_message_reads;

-- 030 の 88行目以降（create policy 〜 ファイル末尾）を 030_deal_board_milestones.sql からコピーして実行してください。
-- または修正済み 030 を先頭から再実行（drop 済みのためポリシーは通ります）。

select 'policies dropped — re-run 030 from line 88 or full 030 file' as next_step;
