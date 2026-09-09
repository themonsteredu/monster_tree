import { isAdminAuthenticated } from "../auth";
import { LoginForm } from "../LoginForm";
import { ForestYardPreview } from "./ForestYardPreview";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function YardPreviewPage({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const params = await searchParams;
  if (!(await isAdminAuthenticated(params.key))) return <LoginForm initialKey={params.key ?? ""} />;
  return <ForestYardPreview />;
}
