import { PlazaClient } from "@/features/social/PlazaClient";
import { YardPlazaEntry } from "@/features/social/YardPlazaEntry";
import { isAdminAuthenticated } from "../auth";
import { LoginForm } from "../LoginForm";

export const dynamic = "force-dynamic";

export default async function PlazaPreviewPage(props:{searchParams: Promise<{key?:string;crowd?:string}>}) {
  const searchParams = await props.searchParams;
  if (!(await isAdminAuthenticated(searchParams.key))) return <LoginForm initialKey={searchParams.key??""}/>;
  return (
    <>
      <section className="mx-auto max-w-xl px-5 pt-5" aria-label="내 마당 광장 연결 미리보기">
        <p className="mb-2 text-xs text-gray-600">내 마당에 표시되는 입구 · 미리보기에서만 이동해요</p>
        <YardPlazaEntry previewMode />
      </section>
      <div id="plaza-preview">
        <PlazaClient adminMode previewCrowd={searchParams.crowd === "24" ? 24 : 6} />
      </div>
    </>
  );
}
