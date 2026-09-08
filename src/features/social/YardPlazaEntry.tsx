type Props = { previewMode?: boolean };

/** Shared yard entrance. A native link crosses from TREE to SITE without a /tree prefix. */
export function YardPlazaEntry({ previewMode = false }: Props) {
  return (
    <a
      href={previewMode ? "#plaza-preview" : "https://www.themonster.kr/plaza"}
      className="mb-3 flex min-h-[76px] items-center gap-3 rounded-2xl border-2 border-[#54753b] bg-[#edf4de] px-4 py-3 text-[#29431e] no-underline shadow-[0_3px_0_#54753b] transition-colors hover:bg-[#e0edc9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#29431e]"
    >
      <span aria-hidden="true" className="shrink-0 text-3xl">🏘️</span>
      <span className="min-w-0 flex-1 font-pretendard">
        <span className="block text-base font-extrabold">우리 광장으로 가기</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-[#4c633d]">
          친구 만나기 · 친구 집 구경
        </span>
      </span>
      <span aria-hidden="true" className="shrink-0 text-xl">→</span>
    </a>
  );
}
