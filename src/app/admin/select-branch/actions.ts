"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { setAdminBranchCookie, clearAdminBranchCookie } from "@/lib/branch";
import { isAdminAuthenticated } from "../auth";

export async function selectBranchAction(formData: FormData) {
  if (!(await isAdminAuthenticated())) {
    throw new Error("AUTH_REQUIRED: 로그인이 필요합니다.");
  }
  const branchId = String(formData.get("branchId") ?? "").trim();
  if (!branchId) {
    throw new Error("BRANCH_REQUIRED: 지점이 누락되었어요.");
  }
  (await setAdminBranchCookie(branchId));
  revalidatePath("/admin", "layout");
  redirect("/admin");
}

export async function clearAdminBranchAction() {
  if (!(await isAdminAuthenticated())) return;
  (await clearAdminBranchCookie());
  revalidatePath("/admin", "layout");
  redirect("/admin/select-branch");
}
