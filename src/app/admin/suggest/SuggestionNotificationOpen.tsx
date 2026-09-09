"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { openSuggestionNotificationAction } from "./notification-actions";

export function SuggestionNotificationOpen({ id }: { id: string }) {
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    void openSuggestionNotificationAction(id).then(result => {
      if (cancelled) return;
      if (result.ok) window.location.replace(result.url);
      else setError(result.message);
    }).catch(() => { if (!cancelled) setError("건의함을 열지 못했어요. 다시 접속해주세요."); });
    return () => { cancelled = true; };
  }, [id]);
  return <main className="mx-auto max-w-lg p-6 text-center" aria-live="polite">
    <p>{error || "새 건의를 열고 있어요…"}</p>
    {error && <Link href="/admin/suggest" className="mt-4 inline-flex min-h-11 items-center underline">건의함으로 가기</Link>}
  </main>;
}
