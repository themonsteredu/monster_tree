import { retiredSocialResponse } from "@/lib/social/retired";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Never forward old writes or read authentication, students, homes or presence from the tree database.
export const GET = retiredSocialResponse;
export const POST = retiredSocialResponse;
export const PUT = retiredSocialResponse;
export const PATCH = retiredSocialResponse;
export const DELETE = retiredSocialResponse;
export const HEAD = retiredSocialResponse;
export const OPTIONS = retiredSocialResponse;
