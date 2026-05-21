// /admin — "몬스터마을" 허브의 entry point. 본문은 /admin/garden 으로 이동됨.
// 직접 접근하거나 monster-site 의 핸드오프 (?branch=&name=) 가 도착하면 모두 /admin/garden 으로 redirect.
// querystring 은 그대로 forward 해서 핸드오프 흐름이 끊기지 않게 한다.

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminEntryPage({
  searchParams,
}: {
  searchParams: { key?: string; class?: string; branch?: string; name?: string };
}) {
  const qs = new URLSearchParams();
  if (searchParams.key) qs.set("key", searchParams.key);
  if (searchParams.class) qs.set("class", searchParams.class);
  if (searchParams.branch) qs.set("branch", searchParams.branch);
  if (searchParams.name) qs.set("name", searchParams.name);
  const tail = qs.toString();
  redirect(`/admin/garden${tail ? `?${tail}` : ""}`);
}
