import { redirect } from "next/navigation";
import { getSitePlazaUrl } from "@/lib/social/retired";

export const dynamic = "force-dynamic";

export default function PlazaPage() {
  // Login and all live social data now belong to monster-site.
  redirect(getSitePlazaUrl());
}
