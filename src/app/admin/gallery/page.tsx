// /admin/gallery — 아바타 꾸미기 갤러리 관리자 페이지.
// 카테고리(base/outfit/hat/accessory) 별로 이미지를 업로드해두면 학생들이 합성해서 사용.

import Link from "next/link";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { isAdminAuthenticated } from "../auth";
import { LoginForm } from "../LoginForm";
import { GalleryClient } from "./GalleryClient";
import type { AvatarGalleryItem } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function GalleryAdminPage({
  searchParams,
}: {
  searchParams: { key?: string };
}) {
  if (!isAdminAuthenticated(searchParams.key)) {
    return <LoginForm initialKey={searchParams.key ?? ""} />;
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return (
      <main className="p-6 text-center text-ink-soft">
        Supabase 환경변수가 설정되지 않았어요.
      </main>
    );
  }

  const sb = createSupabaseServiceClient();
  const { data } = await sb
    .from("garden_avatar_gallery")
    .select("id, category, label, image_url, sort_order, active, created_at")
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true });

  return (
    <main className="min-h-screen pb-20">
      <header className="sticky top-0 z-30 bg-cream/90 backdrop-blur border-b border-pot/10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-2">
          <Link href="/admin" className="text-ink-soft hover:text-apple text-sm shrink-0">← 관리</Link>
          <h1 className="text-xl font-bold truncate">아바타 갤러리</h1>
        </div>
      </header>
      <GalleryClient initialItems={(data ?? []) as AvatarGalleryItem[]} />
    </main>
  );
}
