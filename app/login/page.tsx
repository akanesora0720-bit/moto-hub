"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthLayout } from "@/components/AuthLayout";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const suspended = params.get("suspended") === "1";
  const banned = params.get("banned") === "1";
  const profileError = params.get("error") === "profile";
  const next = params.get("next") && params.get("next")!.startsWith("/") ? params.get("next")! : "/";

  const submit = async () => {
    setMessage("");
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }
    router.replace(next);
    router.refresh();
  };

  return (
    <AuthLayout title="ログイン" subtitle="登録済みの業者アカウントでサインイン">
      {banned ? (
        <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          アカウントはBAN（永久停止）されています。運営にお問い合わせください。
        </p>
      ) : suspended ? (
        <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          アカウントが停止されています。運営にお問い合わせください。
        </p>
      ) : null}
      {profileError ? (
        <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          会員情報の読み込みに失敗しました。再度ログインするか、運営にお問い合わせください。
        </p>
      ) : null}

      <div className="space-y-4">
        <label className="block text-sm">
          <span className="text-muted">メールアドレス</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5 text-sm outline-none focus:border-accent"
            autoComplete="email"
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted">パスワード</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5 text-sm outline-none focus:border-accent"
            autoComplete="current-password"
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
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-black hover:bg-accent-dim disabled:opacity-60"
        >
          {loading ? "処理中…" : "ログイン"}
        </button>

        <p className="text-center text-sm text-muted">
          業者の会員登録は{" "}
          <Link href="/signup" className="text-accent hover:underline">
            こちら
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
