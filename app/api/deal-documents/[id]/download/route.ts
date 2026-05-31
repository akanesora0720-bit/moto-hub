import { NextRequest, NextResponse } from "next/server";
import { DEAL_DOCUMENT_SIGNED_URL_TTL_SEC, DEAL_GENERATED_DOCS_BUCKET } from "@/lib/deal-documents";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 書類の期限付き署名URLへリダイレクト（通知・書類タブから再ダウンロード可） */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: doc, error } = await supabase
    .from("deal_generated_documents")
    .select("id, storage_path, file_name, mime_type, deal_id")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!doc) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { data: signed, error: signError } = await supabase.storage
    .from(DEAL_GENERATED_DOCS_BUCKET)
    .createSignedUrl(doc.storage_path, DEAL_DOCUMENT_SIGNED_URL_TTL_SEC, {
      download: doc.file_name,
    });

  if (signError || !signed?.signedUrl) {
    return NextResponse.json(
      { error: signError?.message ?? "signed url failed" },
      { status: 500 },
    );
  }

  return NextResponse.redirect(signed.signedUrl);
}
