import { notFound } from "next/navigation";
import { DecorationReview } from "./DecorationReview";

// Disposable branch-preview fixtures only. The authenticated admin preview remains
// the production entry; this review route must never expose student data.
export const dynamic = "force-dynamic";
export default function DecorationPreviewPage() {
  if (process.env.VERCEL_ENV !== "preview") notFound();
  return <DecorationReview />;
}
