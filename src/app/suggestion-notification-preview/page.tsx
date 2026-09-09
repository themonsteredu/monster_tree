import { notFound } from "next/navigation";
import { AdminSuggestionNotifications } from "@/app/admin/suggest/AdminSuggestionNotifications";

export const dynamic = "force-dynamic";

export default async function NotificationPreview({ searchParams }: { searchParams: Promise<{ mobile?: string }> }) {
  if (process.env.VERCEL_ENV !== "preview") notFound();
  const params = await searchParams;
  if (params.mobile === "1") return <main style={{ minHeight: "100vh", padding: 16, background: "#f5f3ee" }}>
    <iframe title="휴대폰 건의 알림 미리보기" src="/tree/suggestion-notification-preview"
      style={{ display: "block", width: 360, height: 800, maxWidth: "100%", border: "1px solid #d6d3ca", margin: "auto", background: "white" }} />
  </main>;
  return <main style={{ maxWidth: 880, padding: 20, margin: "auto" }}>
    <h1 style={{ fontSize: 24, marginBottom: 16 }}>건의함 관리</h1>
    <AdminSuggestionNotifications previewMode />
  </main>;
}
