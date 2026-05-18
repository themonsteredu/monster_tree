"use client";

// 마이룸 날씨/분위기 효과 — 8종.
// - 부모 컨테이너에 container-type: size 를 걸어 cqh / cqw 단위로 부모 크기를 직접 참조한다.
//   (이전에는 translateY(120%) 가 "자기 자신" 크기의 120% 라 작은 파티클이 거의 안 움직였음.)
// - transform + opacity 만 애니메이션 → 60fps 유지.
// - pointer-events: none → 캐릭터/UI 클릭 방해 X.
// - 시드 기반 mulberry32 → 재렌더에도 입자 위치 안정.

import { useMemo } from "react";
import type { WeatherType } from "@/lib/types";

const KEYFRAMES = `
@keyframes weatherRainFall {
  from { transform: translate3d(0,-15cqh,0); }
  to   { transform: translate3d(0,115cqh,0); }
}
@keyframes weatherSnowFall {
  from { transform: translate3d(0,-10cqh,0); }
  to   { transform: translate3d(0,115cqh,0); }
}
@keyframes weatherSnowSway {
  0%   { margin-left: -10px; }
  50%  { margin-left: 10px; }
  100% { margin-left: -10px; }
}
@keyframes weatherPetalFall {
  0%   { transform: translate3d(0,-10cqh,0) rotate(0deg); }
  100% { transform: translate3d(0,115cqh,0) rotate(540deg); }
}
@keyframes weatherPetalSway {
  0%   { margin-left: -14px; }
  50%  { margin-left: 14px; }
  100% { margin-left: -14px; }
}
@keyframes weatherSunshinePan {
  0%   { transform: translate3d(-8%,-8%,0); opacity: 0.5; }
  50%  { transform: translate3d(0,0,0);     opacity: 0.75; }
  100% { transform: translate3d(6%,6%,0);   opacity: 0.5; }
}
@keyframes weatherFireflyDrift {
  0%   { transform: translate3d(0,0,0);          opacity: 0; }
  15%  { transform: translate3d(8px,-15cqh,0);   opacity: 0.9; }
  40%  { transform: translate3d(-10px,-40cqh,0); opacity: 0.4; }
  65%  { transform: translate3d(12px,-65cqh,0);  opacity: 0.95; }
  90%  { transform: translate3d(-6px,-90cqh,0);  opacity: 0.5; }
  100% { transform: translate3d(0,-110cqh,0);    opacity: 0; }
}
@keyframes weatherStarTwinkle {
  0%, 100% { opacity: 0.15; transform: scale(0.8); }
  50%      { opacity: 0.95; transform: scale(1.15); }
}
@keyframes weatherLeafFall {
  0%   { transform: translate3d(0,-10cqh,0) rotate(0deg); }
  100% { transform: translate3d(0,115cqh,0) rotate(720deg); }
}
@keyframes weatherLeafSway {
  0%   { margin-left: -12px; }
  50%  { margin-left: 12px; }
  100% { margin-left: -12px; }
}
`;

type ParticleSpec = {
  left: string;
  delay: string;     // 보통 음수 — 즉시 진행 중 효과
  duration: string;  // 낙하 시간
  swayDuration: string;
  size: number;
  rotateBase: number;
};

function useRandomSpecs(seed: WeatherType, count: number, durRange: [number, number]): ParticleSpec[] {
  return useMemo(() => {
    let rng = hashStr(seed) >>> 0;
    const next = () => {
      rng = (rng + 0x6d2b79f5) >>> 0;
      let t = rng;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const [lo, hi] = durRange;
    const out: ParticleSpec[] = [];
    for (let i = 0; i < count; i++) {
      const dur = lo + next() * (hi - lo);
      out.push({
        left: `${(next() * 100).toFixed(2)}%`,
        // 음수 delay (한 사이클 만큼 무작위) — 시작 시 한꺼번에 떨어지지 않게.
        delay: `${(-next() * dur).toFixed(2)}s`,
        duration: `${dur.toFixed(2)}s`,
        swayDuration: `${(1.5 + next() * 2.5).toFixed(2)}s`,
        size: 4 + Math.floor(next() * 10),
        rotateBase: Math.floor(next() * 360),
      });
    }
    return out;
  }, [seed, count, durRange]);
}

function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return h;
}

const overlayStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  overflow: "hidden",
  zIndex: 3, // 배경(1) → 캐릭터(2) → 날씨(3) → UI(4+)
  // 자식 cqh/cqw 가 이 박스 기준이 되도록.
  containerType: "size",
} as React.CSSProperties;

export function WeatherEffect({ weather }: { weather: WeatherType }) {
  if (!weather || weather === "none") return null;

  return (
    <div aria-hidden style={overlayStyle}>
      <style jsx global>{KEYFRAMES}</style>
      {weather === "rain" && <Rain />}
      {weather === "snow" && <Snow />}
      {weather === "cherry_blossom" && <CherryBlossom />}
      {weather === "sunshine" && <Sunshine />}
      {weather === "firefly" && <Firefly />}
      {weather === "stars" && <Stars />}
      {weather === "autumn_leaves" && <AutumnLeaves />}
    </div>
  );
}

/* ============ rain — 짧고 가는 파란 선, 빠르게 직선 낙하 ============ */
const RAIN_DUR: [number, number] = [0.8, 1.6];
function Rain() {
  const specs = useRandomSpecs("rain", 55, RAIN_DUR);
  return (
    <>
      {specs.map((p, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            top: 0,
            left: p.left,
            width: 1.5,
            height: 12,
            background: "linear-gradient(180deg, rgba(150,190,240,0) 0%, rgba(150,190,240,0.7) 100%)",
            borderRadius: 1,
            opacity: 0.55,
            animation: `weatherRainFall ${p.duration} linear ${p.delay} infinite`,
            willChange: "transform",
          }}
        />
      ))}
    </>
  );
}

/* ============ snow — 작은 흰 원, 천천히 좌우 sway ============ */
const SNOW_DUR: [number, number] = [4, 7];
function Snow() {
  const specs = useRandomSpecs("snow", 55, SNOW_DUR);
  return (
    <>
      {specs.map((p, i) => {
        const sz = 4 + (p.size % 5); // 4~8px
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              top: 0,
              left: p.left,
              width: sz,
              height: sz,
              animation: `weatherSnowFall ${p.duration} linear ${p.delay} infinite`,
              willChange: "transform",
            }}
          >
            <span
              style={{
                display: "block",
                width: sz,
                height: sz,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.85)",
                boxShadow: "0 0 3px rgba(255,255,255,0.6)",
                opacity: 0.7,
                animation: `weatherSnowSway ${p.swayDuration} ease-in-out ${p.delay} infinite`,
                willChange: "margin-left",
              }}
            />
          </span>
        );
      })}
    </>
  );
}

/* ============ cherry_blossom — 분홍 꽃잎, 회전 + 살랑살랑 ============ */
const PETAL_DUR: [number, number] = [5, 9];
function CherryBlossom() {
  const specs = useRandomSpecs("cherry_blossom", 55, PETAL_DUR);
  return (
    <>
      {specs.map((p, i) => {
        const sz = 8 + (p.size % 5); // 8~12px
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              top: 0,
              left: p.left,
              width: sz,
              height: sz,
              animation: `weatherPetalFall ${p.duration} linear ${p.delay} infinite`,
              willChange: "transform",
            }}
          >
            <span
              style={{
                display: "block",
                width: sz,
                height: sz,
                borderRadius: "60% 0 60% 0",
                background: "linear-gradient(135deg, #fbcfe8, #f9a8d4)",
                boxShadow: "0 0 2px rgba(244,114,182,0.35)",
                opacity: 0.72,
                animation: `weatherPetalSway ${p.swayDuration} ease-in-out ${p.delay} infinite`,
                willChange: "margin-left",
                transform: `rotate(${p.rotateBase}deg)`,
              }}
            />
          </span>
        );
      })}
    </>
  );
}

/* ============ sunshine — 햇살빔 + 따뜻한 오버레이 ============ */
function Sunshine() {
  return (
    <>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 80% 0%, rgba(255,235,150,0.35) 0%, rgba(255,235,150,0) 60%)",
          mixBlendMode: "screen",
        }}
      />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: "-30%",
            left: `${-10 + i * 18}%`,
            width: "10%",
            height: "160%",
            transform: "rotate(20deg)",
            background:
              "linear-gradient(180deg, rgba(255,240,170,0) 0%, rgba(255,240,170,0.5) 50%, rgba(255,240,170,0) 100%)",
            filter: "blur(8px)",
            mixBlendMode: "screen",
            animation: `weatherSunshinePan ${5 + i * 0.7}s ease-in-out ${-i * 0.4}s infinite alternate`,
            willChange: "transform, opacity",
          }}
        />
      ))}
    </>
  );
}

/* ============ firefly — 작은 노란 점, 부유 + 깜빡 + 살짝 어둡게 ============ */
const FIREFLY_DUR: [number, number] = [6, 12];
function Firefly() {
  const specs = useRandomSpecs("firefly", 40, FIREFLY_DUR);
  return (
    <>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(20,20,40,0.18)",
        }}
      />
      {specs.map((p, i) => {
        const sz = 3 + (p.size % 3); // 3~5px
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              left: p.left,
              // 시작 위치를 컨테이너 아래쪽~중간에 분산
              top: `${60 + (i % 8) * 5}%`,
              width: sz,
              height: sz,
              borderRadius: "50%",
              background: "rgba(252, 211, 77, 0.95)",
              boxShadow:
                "0 0 6px rgba(252,211,77,0.95), 0 0 12px rgba(250,204,21,0.6)",
              animation: `weatherFireflyDrift ${p.duration} ease-in-out ${p.delay} infinite`,
              willChange: "transform, opacity",
            }}
          />
        );
      })}
    </>
  );
}

/* ============ stars — 반짝이는 작은 점 + 어두운 오버레이 ============ */
function Stars() {
  const specs = useRandomSpecs("stars", 60, [1.6, 3.4]);
  return (
    <>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(10,10,30,0.22)",
        }}
      />
      {specs.map((p, i) => {
        const sz = 2 + (p.size % 3); // 2~4px
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              left: p.left,
              top: `${(i * 6.3) % 100}%`,
              width: sz,
              height: sz,
              borderRadius: "50%",
              background: "#fff",
              boxShadow: "0 0 3px rgba(255,255,255,0.95), 0 0 6px rgba(200,220,255,0.7)",
              animation: `weatherStarTwinkle ${p.duration} ease-in-out ${p.delay} infinite`,
              willChange: "opacity, transform",
            }}
          />
        );
      })}
    </>
  );
}

/* ============ autumn_leaves — 빨강/주황 잎, 회전 + sway ============ */
const LEAF_DUR: [number, number] = [4, 8];
function AutumnLeaves() {
  const specs = useRandomSpecs("autumn_leaves", 55, LEAF_DUR);
  const colors = ["#ea580c", "#dc2626", "#d97706", "#b45309", "#a16207"];
  return (
    <>
      {specs.map((p, i) => {
        const sz = 10 + (p.size % 5); // 10~14px
        const color = colors[i % colors.length];
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              top: 0,
              left: p.left,
              width: sz,
              height: sz * 0.7,
              animation: `weatherLeafFall ${p.duration} linear ${p.delay} infinite`,
              willChange: "transform",
            }}
          >
            <span
              style={{
                display: "block",
                width: sz,
                height: sz * 0.7,
                borderRadius: "50% 10% 50% 10%",
                background: color,
                opacity: 0.72,
                boxShadow: "0 0 1px rgba(0,0,0,0.2)",
                animation: `weatherLeafSway ${p.swayDuration} ease-in-out ${p.delay} infinite`,
                willChange: "margin-left",
              }}
            />
          </span>
        );
      })}
    </>
  );
}
