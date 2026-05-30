<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## 機能変更時の同期（必須）

フロー・ボタン・料金を変えた PR では、実装とあわせて次を確認・更新する。

1. **画面** — `docs/UX_FLOW_AUDIT.md`（ボタン ＝ RPC ＝ 通知）
2. **操作説明** — `lib/dealer-manual.ts`（`/help`）、`lib/admin-manual.ts`（`/admin/help`）
3. **規約・料金**（該当時）— `lib/terms-document.ts`（`/terms`）、`lib/fee-schedule.ts`（`/pricing`）、`lib/legal-policies.ts`

詳細: `docs/content-sync-checklist.md`
