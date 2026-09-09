import { notFound } from "next/navigation";
import { DecorationReview } from "./DecorationReview";

// Disposable branch-preview fixtures only. The authenticated admin preview remains
// the production entry; this review route must never expose student data.
export const dynamic = "force-dynamic";
export default async function DecorationPreviewPage({ searchParams }: { searchParams: Promise<{ mobile?: string }> }) {
  if (process.env.VERCEL_ENV !== "preview") notFound();
  if ((await searchParams).mobile === "1") return <iframe title="휴대폰 미리보기" src="/tree/decor-studio-preview" style={{ display: "block", width: 360, height: 800, margin: "16px auto", border: "1px solid #ddd" }} />;
  return <DecorationReview />;
}
