"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthLayout } from "@/components/AuthLayout";
import { BRAND } from "@/lib/brand";
import { LegalPoliciesConsent } from "@/components/LegalPoliciesConsent";
import { createClient } from "@/lib/supabase/client";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  privacyPdfAbsoluteUrl,
  termsPdfAbsoluteUrl,
} from "@/lib/legal-policies";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [policiesAccepted, setPoliciesAccepted] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setMessage("");
    if (!policiesAccepted) {
      setMessage("利用規約・プライバシーポリシーを確認のうえ、同意にチェックを入れてください。");
      return;
    }
    if (password.length < 8) {
      setMessage("パスワードは8文字以上にしてください。");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/login?next=/onboarding`,
      },
    });
    setLoading(false);

    if (error) {
      const m = error.message.toLowerCase();
      if (m.includes("already registered") || m.includes("already been registered")) {
        setMessage("このメールは登録済みです。ログイン画面からサインインしてください。");
      } else if (m.includes("signup") && m.includes("disabled")) {
        setMessage("現在新規登録を受け付けていません。運営にお問い合わせください。");
      } else {
        setMessage(error.message);
      }
      return;
    }

    if (!data.session) {
      setMessage(
        "登録を受け付けました。確認メールのリンクを開いてからログインしてください。届かない場合は迷惑メールもご確認ください。",
      );
      return;
    }

    const origin = window.location.origin;
    const { error: policiesErr } = await supabase.rpc("finalize_dealer_pre_registration", {
      p_terms_version: CURRENT_TERMS_VERSION,
      p_terms_pdf_url: termsPdfAbsoluteUrl(origin),
      p_privacy_version: CURRENT_PRIVACY_VERSION,
      p_privacy_pdf_url: privacyPdfAbsoluteUrl(origin),
    });
    if (policiesErr) {
      setMessage(policiesErr.message);
      return;
    }

    router.replace("/home");
    router.refresh();
  };

  return (
    <AuthLayout title="加盟店登録" subtitle="古物商として業販取引を行う店舗向け（スタッフは招待制）">
      <div className="space-y-4">
        <ol className="list-decimal space-y-1 pl-5 text-xs text-muted">
          <li>メールアドレス・パスワードで登録</li>
          <li>確認メールのリンクからログイン</li>
          <li>初回プロフィール登録</li>
          <li>運営確認後に利用開始</li>
        </ol>
        <p className="rounded-lg border border-border bg-zinc-900/50 px-3 py-2 text-xs text-muted">
          運営スタッフの登録は{" "}
          <Link href="/signup/staff" className="text-accent hover:underline">
            招待リンク
          </Link>
          からのみ可能です。
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

        <LegalPoliciesConsent
          checked={policiesAccepted}
          onChange={setPoliciesAccepted}
          id="signup-policies-consent"
        />

        {message ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            {message}
          </p>
        ) : null}

        <button
          type="button"
          onClick={submit}
          disabled={loading || !policiesAccepted}
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-black hover:bg-accent-dim disabled:opacity-60"
        >
          {loading ? "処理中…" : BRAND.ctaApply}
        </button>

        <p className="text-center text-sm text-muted">
          すでにアカウントがある方は{" "}
          <Link href="/login" className="text-accent hover:underline">
            ログイン
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
