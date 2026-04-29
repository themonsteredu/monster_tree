// /tree/me — 로그인된 학생 본인의 나무/포인트/사과 수 표시.
// monster-site 의 계정 발급 시 garden_students 에 (branch_id, external_student_id) upsert 되었으므로
// JWT 의 두 값을 키로 개인 행을 조회한다.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { STUDENT_COOKIE_NAME, verifyStudentJwt } from '@/lib/student-jwt';
import { createSupabaseServerAnonClient } from '@/lib/supabase/server';
import {
  STAGE_TABLE,
  calculateStage,
  getStageInfo,
  pointsToNextStage,
  stageProgress,
} from '@/lib/garden';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function MyTreePage() {
  const token = cookies().get(STUDENT_COOKIE_NAME)?.value;
  const payload = await verifyStudentJwt(token);
  if (!payload) redirect('https://www.themonster.kr/login');

  const sb = createSupabaseServerAnonClient();
  const { data: row } = await sb
    .from('garden_students')
    .select('id, name, total_points, current_stage, apples_harvested')
    .eq('branch_id', payload!.branchId)
    .eq('external_student_id', payload!.studentLocalId)
    .maybeSingle();

  const points = row?.total_points ?? 0;
  const stage = calculateStage(points);
  const info = getStageInfo(stage);
  const progress = stageProgress(points);
  const remain = pointsToNextStage(points);

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#fffaf2',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        fontFamily:
          '"Noto Sans KR", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 24,
          padding: '36px 28px',
          width: '100%',
          maxWidth: 460,
          boxShadow: '0 10px 40px rgba(0,0,0,0.06)',
          border: '1px solid #f1e8d8',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 13, color: '#9a8b6c' }}>나의 사과정원</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#1f2937', marginTop: 4 }}>
            {payload!.name}
          </div>
        </div>

        {!row ? (
          <div
            style={{
              padding: 20,
              borderRadius: 14,
              background: '#fef9ed',
              color: '#7a6233',
              fontSize: 14,
              lineHeight: 1.6,
              textAlign: 'center',
            }}
          >
            아직 나무가 심어지지 않았어요.
            <br />
            원장님께 문의해주세요.
          </div>
        ) : (
          <>
            <div style={{ textAlign: 'center', marginBottom: 18 }}>
              <div style={{ fontSize: 64, lineHeight: 1, marginBottom: 8 }}>🌳</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#1f2937' }}>
                {info.name} 명계
              </div>
              <div style={{ fontSize: 13, color: '#9a8b6c', marginTop: 4 }}>
                {STAGE_TABLE.length}단계 중 {stage}단계
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
                marginBottom: 18,
              }}
            >
              <Stat label="누적 포인트" value={`${points} P`} />
              <Stat
                label="수확한 사과"
                value={`${row.apples_harvested ?? 0}개`}
              />
            </div>

            <div style={{ marginBottom: 8 }}>
              <div
                style={{
                  height: 10,
                  borderRadius: 999,
                  background: '#fef0d6',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${Math.round(progress * 100)}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #F26522, #ffae5c)',
                  }}
                />
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: '#9a8b6c',
                  marginTop: 6,
                  textAlign: 'center',
                }}
              >
                {info.nextThreshold === null
                  ? '최고 단계!'
                  : `다음 단계까지 ${remain} P`}
              </div>
            </div>
          </>
        )}

        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <a
            href="https://www.themonster.kr/student"
            style={{ fontSize: 13, color: '#F26522', textDecoration: 'none', fontWeight: 700 }}
          >
            ← 학생 홈으로
          </a>
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: '#fff8e8',
        borderRadius: 12,
        padding: '14px 12px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 11, color: '#9a8b6c' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#1f2937', marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}
