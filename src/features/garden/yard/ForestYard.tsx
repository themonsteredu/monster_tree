import Image from "next/image";
import type { ReactNode, Ref } from "react";
import styles from "./ForestYard.module.css";

/** Presentation only: live data/actions belong to MeTreeClient; the preview supplies local examples. */
export function ForestYard({ studentName, grade, points, apples, sign, children }: {
  studentName: string; grade?: string | null; points: number; apples: number; sign: ReactNode; children: ReactNode;
}) {
  return <div className={styles.shell}>
    <header className={styles.header}>
      <div className={styles.identity}><span className={styles.eyebrow}>MY FOREST · 나의 나무</span><h1>{studentName}<span>의 숲속 마당</span></h1>{grade && <small>{grade}</small>}</div>
      <div className={styles.wallet}><div aria-label={`보유 포인트 ${points}P`}><span className={styles.coin} aria-hidden="true">P</span><strong>{points.toLocaleString("ko-KR")}<small>P</small></strong></div><span className={styles.apples}>수확한 사과 <b>{apples.toLocaleString("ko-KR")}</b>개</span></div>
    </header>
    <div className={styles.sign}>{sign}</div>
    {children}
  </div>;
}

export function ForestYardScene({ forest = true, stageRef, children }: {
  forest?: boolean; stageRef?: Ref<HTMLDivElement>; children: ReactNode;
}) {
  return <div ref={stageRef} className={`${styles.scene} ${forest ? "" : styles.customScene}`} data-yard-background={forest ? "forest" : "saved"}>
    {forest && <Image src="/tree/block-world/forest-yard-v1.webp" alt="" fill priority sizes="(max-width: 640px) calc(100vw - 32px), 600px" className={styles.backdrop} />}
    {children}
  </div>;
}

export function ForestYardProgress({ stage, name, progress, remaining, harvest }: {
  stage: number; name: string; progress: number; remaining: number; harvest: boolean;
}) {
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  return <section className={styles.growth} aria-label="나무 성장 상태">
    <div className={styles.growthHeading}><strong>나무 {stage}단계 <span>· {name}</span></strong><span>{harvest ? "수확할 수 있어요!" : <>다음 단계까지 <b>{remaining}P</b></>}</span></div>
    <div className={styles.progress} role="progressbar" aria-label={`${stage}단계 성장`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></div>
  </section>;
}
