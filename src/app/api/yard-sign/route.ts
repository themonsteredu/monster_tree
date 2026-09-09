import { handleYardSign } from "@/lib/yard-sign-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const GET = handleYardSign;
export const POST = handleYardSign;
