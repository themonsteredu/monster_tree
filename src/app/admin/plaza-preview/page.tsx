import { PlazaClient } from "@/features/social/PlazaClient";
import { isAdminAuthenticated } from "../auth";
import { LoginForm } from "../LoginForm";

export const dynamic = "force-dynamic";

export default async function PlazaPreviewPage(props:{searchParams: Promise<{key?:string;crowd?:string}>}) {
  const searchParams = await props.searchParams;
  if (!(await isAdminAuthenticated(searchParams.key))) return <LoginForm initialKey={searchParams.key??""}/>;
  return <PlazaClient adminMode previewCrowd={searchParams.crowd === "24" ? 24 : 6} />;
}
