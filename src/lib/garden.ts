// 사과정원 도메인 로직 - 단계 계산, 라벨, 임계값 등 한 곳에 모아둠
// 기획서 §6 의 8단계 표를 그대로 옮긴 것입니다.

export type Stage = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type StageInfo = {
  stage: Stage;
  name: string; // 한국어 단계 이름
  threshold: number; // 이 단계로 진입하는 누적 포인트
  nextThreshold: number | null; // 다음 단계 진입 포인트 (8단계는 null)
};

// 누적 포인트 → 단계 임계값 (반드시 오름차순)
export const STAGE_TABLE: ReadonlyArray<{
  stage: Stage;
  name: string;
  threshold: number;
}> = [
  { stage: 1, name: "화분", threshold: 0 },
  { stage: 2, name: "씨앗", threshold: 10 },
  { stage: 3, name: "새싹", threshold: 30 },
  { stage: 4, name: "어린나무", threshold: 70 },
  { stage: 5, name: "큰나무", threshold: 130 },
  { stage: 6, name: "꽃나무", threshold: 200 },
  { stage: 7, name: "열매", threshold: 280 },
  { stage: 8, name: "수확!", threshold: 380 },
];

/** 누적 포인트로부터 현재 단계(1~8)를 계산한다. */
export function calculateStage(totalPoints: number): Stage {
  // 음수가 들어오는 경우(과도한 차감)는 1단계로 강제
  const safe = Math.max(0, totalPoints | 0);
  let current: Stage = 1;
  for (const row of STAGE_TABLE) {
    if (safe >= row.threshold) current = row.stage;
    else break;
  }
  return current;
}

/** 단계 → {이름, 임계값, 다음 임계값} 정보 반환 */
export function getStageInfo(stage: Stage): StageInfo {
  const idx = STAGE_TABLE.findIndex((r) => r.stage === stage);
  const cur = STAGE_TABLE[idx];
  const next = STAGE_TABLE[idx + 1];
  return {
    stage: cur.stage,
    name: cur.name,
    threshold: cur.threshold,
    nextThreshold: next ? next.threshold : null,
  };
}

/** 다음 단계까지 남은 포인트 (마지막 단계는 0 반환) */
export function pointsToNextStage(totalPoints: number): number {
  const stage = calculateStage(totalPoints);
  const info = getStageInfo(stage);
  if (info.nextThreshold === null) return 0;
  return Math.max(0, info.nextThreshold - totalPoints);
}

/** 진행률(0~1) - 현재 단계 안에서 다음 단계까지의 비율 */
export function stageProgress(totalPoints: number): number {
  const stage = calculateStage(totalPoints);
  const info = getStageInfo(stage);
  if (info.nextThreshold === null) return 1;
  const span = info.nextThreshold - info.threshold;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (totalPoints - info.threshold) / span));
}
