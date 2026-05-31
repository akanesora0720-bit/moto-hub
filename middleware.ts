import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  // Vercel Cron: session auth 不要（route 側で CRON_SECRET を検証）
  if (request.nextUrl.pathname.startsWith("/api/cron/")) {
    return NextResponse.next({ request });
  }

  try {
    return await updateSession(request);
  } catch {
    return NextResponse.next({ request });
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/cron/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
