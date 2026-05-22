"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthLayout } from "@/components/AuthLayout";
import { createClient } from "@/lib/supabase/client";

export default function StaffSignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setMessage("");
    if (password.length < 8) {
      setMessage("パスワードは8文字以上にしてください。");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { member_type: "staff" },
      },
    });
    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("登録しました。スタッフ情報を入力してください。");
    router.replace("/onboarding");
    router.refresh();
  };

  return (
    <AuthLayout
      title="運営スタッフ登録"
      subtitle="RideWorks 社内の管理担当者向け（古物商不要）"
    >
      <div className="space-y-4">
        <p className="rounded-lg border border-border bg-zinc-900/50 px-3 py-2 text-xs text-muted">
          業者としての会員登録は{" "}
          <Link href="/signup" className="text-accent hover:underline">
            こちら
          </Link>
          。スタッフ登録は管理者から案内された方のみ利用してください。
        </p>
        <label className="block text-sm">
          <span className="text-muted">メールアドレス</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted">パスワード（8文字以上）</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
        </label>

        {message ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            {message}
          </p>
        ) : null}

        <button
          type="button"
          onClick={submit}
          disabled={loading}
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
        >
          {loading ? "処理中…" : "スタッフとして登録"}
        </button>

        <p className="text-center text-sm text-muted">
          <Link href="/login" className="text-accent hover:underline">
            ログイン
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
