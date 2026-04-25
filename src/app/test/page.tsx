// 사과나무 8단계 미리보기 페이지
// /test 로 접속하면 모든 단계를 한 화면에 볼 수 있습니다.
// 디자인 검수용으로만 사용 (배포 후에는 그대로 둬도 무방)

import { AppleTree } from "@/components/AppleTree";
import { STAGE_TABLE } from "@/lib/garden";

export default function TestPage() {
  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-bold mb-2">사과나무 8단계 미리보기</h1>
        <p className="text-ink-soft mb-8">
          이 페이지는 디자인 검수용입니다. 각 단계가 시각적으로 잘 구분되는지 확인하세요.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-4">Large (TV 화면 사이즈)</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          {STAGE_TABLE.map((row) => (
            <Card key={`large-${row.stage}`} stage={row.stage} name={row.name} threshold={row.threshold} size="large" />
          ))}
        </div>

        <h2 className="text-xl font-semibold mt-12 mb-4">Medium (그리드 카드 사이즈)</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          {STAGE_TABLE.map((row) => (
            <Card key={`medium-${row.stage}`} stage={row.stage} name={row.name} threshold={row.threshold} size="medium" />
          ))}
        </div>

        <h2 className="text-xl font-semibold mt-12 mb-4">Small (Admin 행 옆 사이즈)</h2>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
          {STAGE_TABLE.map((row) => (
            <Card key={`small-${row.stage}`} stage={row.stage} name={row.name} threshold={row.threshold} size="small" />
          ))}
        </div>
      </div>
    </main>
  );
}

function Card({
  stage,
  name,
  threshold,
  size,
}: {
  stage: number;
  name: string;
  threshold: number;
  size: "small" | "medium" | "large";
}) {
  return (
    <div className="rounded-2xl bg-white shadow-card p-4 flex flex-col items-center">
      <AppleTree stage={stage} size={size} />
      <div className="mt-3 text-center">
        <div className="text-sm text-ink-soft">{stage}단계</div>
        <div className="text-lg font-semibold">{name}</div>
        <div className="text-xs text-ink-soft mt-1">{threshold}pt~</div>
      </div>
    </div>
  );
}
