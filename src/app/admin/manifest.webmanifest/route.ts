export function GET() {
  return Response.json({
    id: "/tree/admin/suggest", name: "더몬스터 건의함 관리", short_name: "건의함",
    description: "원장님을 위한 학생 건의 알림과 답변 관리",
    start_url: "/tree/admin/suggest", scope: "/tree/admin/", display: "standalone",
    background_color: "#fff8ec", theme_color: "#fff8ec", lang: "ko",
    icons: [{ src: "/tree/icons/monster-symbol.png", sizes: "1254x1254", type: "image/png", purpose: "any" }],
  }, { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } });
}
