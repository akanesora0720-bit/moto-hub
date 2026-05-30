import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isDealerLimitedPathAllowed } from "@/lib/account-status";
import { isPublicAppPath } from "@/lib/legal-policies";
import { encodeProfile, type ViewerProfile } from "@/lib/viewer";
import type { AccountStatus } from "@/lib/types";

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const publicPaths = ["/login", "/signup", "/api/ai-listing/health"];
  const isPublic =
    publicPaths.some((p) => path.startsWith(p)) || isPublicAppPath(path);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !supabaseAnonKey) {
    if (isPublic) return NextResponse.next({ request });
    return new NextResponse(
      "Server misconfigured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY on Vercel, then Redeploy.",
      { status: 500 },
    );
  }

  const requestHeaders = new Headers(request.headers);
  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request: { headers: requestHeaders },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (user && (path === "/login" || path === "/signup" || path === "/signup/staff")) {
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    return NextResponse.redirect(url);
  }

  if (user && !isPublic) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(
        "profile_completed, is_active, is_banned, is_admin, member_type, account_status",
      )
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      if (path.startsWith("/admin") || path === "/") {
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        url.searchParams.set("error", "profile");
        return NextResponse.redirect(url);
      }
      return supabaseResponse;
    }

    if (!profile) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }

    const accountStatus = (profile.account_status ?? "pre_registered") as AccountStatus;

    if (profile.is_banned || accountStatus === "suspended" || !profile.is_active) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set(profile.is_banned ? "banned" : "suspended", "1");
      return NextResponse.redirect(url);
    }

    const isDealer = profile.member_type === "dealer";

    if (isDealer && accountStatus === "rejected") {
      const rejectedAllowed =
        path.startsWith("/settings") ||
        path.startsWith("/membership") ||
        path === "/home";
      if (!rejectedAllowed) {
        const url = request.nextUrl.clone();
        url.pathname = "/membership/rejected";
        return NextResponse.redirect(url);
      }
    }

    if (isDealer && (accountStatus === "pre_registered" || accountStatus === "pending_review")) {
      if (!isDealerLimitedPathAllowed(path) && path !== "/onboarding") {
        const url = request.nextUrl.clone();
        url.pathname = "/home";
        return NextResponse.redirect(url);
      }
    } else if (isDealer && !profile.profile_completed && path !== "/onboarding") {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }

    const canAdmin =
      profile?.is_admin === true || profile?.member_type === "staff";

    if (path.startsWith("/admin") && !canAdmin) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }

    if (
      profile?.member_type === "staff" &&
      (path === "/listings/new" || path === "/listings/mine")
    ) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin";
      return NextResponse.redirect(url);
    }

    if (profile?.member_type === "staff" && path === "/") {
      const url = request.nextUrl.clone();
      url.pathname = "/admin";
      return NextResponse.redirect(url);
    }

    if (profile?.member_type === "dealer" && path === "/") {
      const url = request.nextUrl.clone();
      url.pathname = "/home";
      return NextResponse.redirect(url);
    }

    requestHeaders.set("x-mh-uid", user.id);
    requestHeaders.set(
      "x-mh-profile",
      encodeProfile(profile as ViewerProfile),
    );
  }

  return supabaseResponse;
}
