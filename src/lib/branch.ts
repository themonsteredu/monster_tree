// 사과정원 sap 의 현재 지점 ID.
// 지점별로 사과정원 deployment 이 따로 존재하며, 각각 BRANCH_ID env 설정.
//
// 설정 예:
//   계림점: BRANCH_ID=monster_gyerim
//   봉선점: BRANCH_ID=monster_bong
//
// 설정 안 되면 admin 은 빈 화면 + 경고 배너 (지점 혼합 방지).

export function getBranchId(): string | null {
  const b = process.env.BRANCH_ID;
  if (!b || !b.trim()) return null;
  return b.trim();
}
