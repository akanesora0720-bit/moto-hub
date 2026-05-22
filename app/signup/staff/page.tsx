"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AuthLayout } from "@/components/AuthLayout";
import { createClient } from "@/lib/supabase/client";

function StaffSignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token")?.trim() ?? "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [inviteValid, setInviteValid] = useState(false);

  useEffect(() => {
    if (!token) {
      setChecking(false);
      setInviteValid(false);
      return;
    }
    const supabase = createClient();
    supabase
      .rpc("get_staff_invite_for_signup", { p_token: token })
      .then(({ data, error }) => {
        setChecking(false);
        if (error) {
          setInviteValid(false);
          return;
        }
        const r = data as { valid?: boolean; email?: string };
        if (r?.valid && r.email) {
          setInviteValid(true);
          setEmail(r.email);
        }
      });
  }, [token]);

  const submit = async () => {
    setMessage("");
    if (!inviteValid || !token) {
      setMessage("招待リンクが無効です。運営にお問い合わせください。");
      return;
    }
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
        data: { member_type: "staff", staff_invite_token: token },
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

  if (checking) {
    return (
      <AuthLayout title="運営スタッフ登録" subtitle="招待を確認しています…">
        <p className="text-sm text-muted">しばらくお待ちください。</p>
      </AuthLayout>
    );
  }

  if (!token || !inviteValid) {
    return (
      <AuthLayout title="招待が必要です" subtitle="運営スタッフの登録">
        <p className="rounded-lg border border-border bg-zinc-900/50 px-3 py-3 text-sm text-muted">
          スタッフ登録は運営から送られた<strong className="text-foreground">招待リンク</strong>
          からのみ行えます。公開登録はありません。
        </p>
        <p className="mt-4 text-center text-sm">
          <Link href="/login" className="text-accent hover:underline">
            ログインへ
          </Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="運営スタッフ登録"
      subtitle="招待されたメールアドレスでアカウントを作成"
    >
      <div className="space-y-4">
        <label className="block text-sm">
          <span className="text-muted">メールアドレス（招待済み）</span>
          <input
            type="email"
            value={email}
            readOnly
            className="mt-1 w-full rounded-lg border border-border bg-zinc-900 px-3 py-2.5 text-sm text-muted"
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

export default function StaffSignupPage() {
  return (
    <Suspense>
      <StaffSignupForm />
    </Suspense>
  );
}
