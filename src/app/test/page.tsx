// 사과나무 8단계 + 표정 변형 미리보기 페이지
// /test 로 접속하면 모든 단계와 표정을 한 화면에 볼 수 있습니다.
// 디자인 검수용으로만 사용 (배포 후에는 그대로 둬도 무방)

import { AppleTree, type AppleTreeMood } from "@/components/AppleTree";
import { STAGE_TABLE } from "@/lib/garden";

export default function TestPage() {
  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-extrabold mb-2 text-[var(--ink)]">
          사과나무 8단계 미리보기
        </h1>
        <p className="text-[var(--ink-soft)] mb-8">
          이 페이지는 디자인 검수용입니다. 각 단계가 시각적으로 잘 구분되는지 확인하세요.
        </p>

        <Section title="Large (TV 화면 사이즈) · 기본 표정">
          <Grid cols={4}>
            {STAGE_TABLE.map((row) => (
              <Card
                key={`large-${row.stage}`}
                stage={row.stage}
                name={row.name}
                threshold={row.threshold}
                size="large"
              />
            ))}
          </Grid>
        </Section>

        <Section title="Medium (그리드 카드 사이즈)">
          <Grid cols={4}>
            {STAGE_TABLE.map((row) => (
              <Card
                key={`medium-${row.stage}`}
                stage={row.stage}
                name={row.name}
                threshold={row.threshold}
                size="medium"
              />
            ))}
          </Grid>
        </Section>

        <Section title="Small (Admin 행 사이즈)">
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
            {STAGE_TABLE.map((row) => (
              <Card
                key={`small-${row.stage}`}
                stage={row.stage}
                name={row.name}
                threshold={row.threshold}
                size="small"
              />
            ))}
          </div>
        </Section>

        <Section title="표정 변형 (5단계 기준)">
          <Grid cols={3}>
            <Card stage={5} name="기본 (happy)" threshold={130} size="large" mood="happy" />
            <Card
              stage={5}
              name="놀람 (surprised)"
              threshold={130}
              size="large"
              mood="surprised"
            />
            <Card
              stage={5}
              name="슬픔 (sad)"
              threshold={130}
              size="large"
              mood="sad"
            />
          </Grid>
        </Section>
      </div>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <h2 className="text-xl font-extrabold mt-12 mb-4 text-[var(--ink)]">
        {title}
      </h2>
      {children}
    </>
  );
}

function Grid({
  cols,
  children,
}: {
  cols: 3 | 4;
  children: React.ReactNode;
}) {
  return (
    <div
      className={[
        "grid gap-6",
        cols === 4
          ? "grid-cols-2 sm:grid-cols-4"
          : "grid-cols-1 sm:grid-cols-3",
      ].join(" ")}
    >
      {children}
    </div>
  );
}

function Card({
  stage,
  name,
  threshold,
  size,
  mood = "happy",
}: {
  stage: number;
  name: string;
  threshold: number;
  size: "small" | "medium" | "large";
  mood?: AppleTreeMood;
}) {
  return (
    <div className="rounded-[22px] bg-white border-[2.5px] border-[var(--ink)] shadow-card p-4 flex flex-col items-center">
      <AppleTree stage={stage} size={size} mood={mood} />
      <div className="mt-3 text-center">
        <div className="text-sm font-bold text-[var(--ink-soft)]">
          {stage}단계
        </div>
        <div className="text-lg font-extrabold text-[var(--ink)]">{name}</div>
        <div className="text-xs font-semibold text-[var(--ink-soft)] mt-1">
          {threshold}pt~
        </div>
      </div>
    </div>
  );
}
