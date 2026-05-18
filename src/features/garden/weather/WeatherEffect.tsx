"use client";

// 마이룸 날씨/분위기 효과 — 8종.
// 모든 효과는 부모 컨테이너 안에 position: absolute 로 깔리며 pointer-events: none.
// transform / opacity 만 애니메이션해서 모바일에서도 60fps 유지.
// 파티클 개수는 30~50개로 제한.

import { useMemo } from "react";
import type { WeatherType } from "@/lib/types";

const KEYFRAMES = `
@keyframes weatherRainFall {
  from { transform: translate3d(0,-20%,0); opacity: 0.85; }
  to   { transform: translate3d(0,120%,0); opacity: 0.85; }
}
@keyframes weatherSnowFall {
  0%   { transform: translate3d(0,-20%,0); opacity: 0.95; }
  100% { transform: translate3d(0,120%,0); opacity: 0.95; }
}
@keyframes weatherSnowSway {
  0%   { margin-left: 0; }
  50%  { margin-left: 14px; }
  100% { margin-left: 0; }
}
@keyframes weatherPetalFall {
  0%   { transform: translate3d(0,-20%,0) rotate(0deg); }
  100% { transform: translate3d(0,120%,0) rotate(540deg); }
}
@keyframes weatherSunshinePan {
  0%   { transform: translate3d(-12%,-12%,0); opacity: 0.55; }
  50%  { transform: translate3d(0,0,0);       opacity: 0.75; }
  100% { transform: translate3d(8%,8%,0);     opacity: 0.55; }
}
@keyframes weatherFireflyDrift {
  0%   { transform: translate3d(0,0,0);     opacity: 0.15; }
  25%  { transform: translate3d(20px,-30px,0);  opacity: 1; }
  50%  { transform: translate3d(-15px,-60px,0); opacity: 0.4; }
  75%  { transform: translate3d(10px,-90px,0);  opacity: 0.9; }
  100% { transform: translate3d(0,-120px,0); opacity: 0; }
}
@keyframes weatherStarTwinkle {
  0%, 100% { opacity: 0.15; transform: scale(0.8); }
  50%      { opacity: 1;   transform: scale(1.2); }
}
@keyframes weatherLeafFall {
  0%   { transform: translate3d(0,-20%,0) rotate(0deg); }
  100% { transform: translate3d(40px,120%,0) rotate(720deg); }
}
`;

type ParticleSpec = {
  left: string;
  delay: string;
  duration: string;
  size: number;
  rotateBase?: number;
  hue?: number;
};

function useRandomSpecs(seed: WeatherType, count: number): ParticleSpec[] {
  // useMemo 로 같은 weather 일 때 동일한 시드를 재사용 — 재렌더 시 점들이 튀지 않게.
  return useMemo(() => {
    let rng = hashStr(seed) >>> 0;
    const next = () => {
      // mulberry32
      rng = (rng + 0x6d2b79f5) >>> 0;
      let t = rng;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const out: ParticleSpec[] = [];
    for (let i = 0; i < count; i++) {
      out.push({
        left: `${(next() * 100).toFixed(2)}%`,
        delay: `${(next() * -10).toFixed(2)}s`, // 음수 delay = 즉시 진행 중인 것처럼
        duration: `${(2 + next() * 4).toFixed(2)}s`,
        size: 4 + Math.floor(next() * 10),
        rotateBase: Math.floor(next() * 360),
        hue: next(),
      });
    }
    return out;
  }, [seed, count]);
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
  zIndex: 25,
};

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

/* ============ rain ============ */
function Rain() {
  const specs = useRandomSpecs("rain", 40);
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
            height: 14 + p.size,
            background: "linear-gradient(180deg, rgba(120,160,220,0) 0%, rgba(150,190,240,0.9) 100%)",
            borderRadius: 1,
            animation: `weatherRainFall ${p.duration} linear ${p.delay} infinite`,
            willChange: "transform, opacity",
          }}
        />
      ))}
    </>
  );
}

/* ============ snow ============ */
function Snow() {
  const specs = useRandomSpecs("snow", 35);
  return (
    <>
      {specs.map((p, i) => {
        const sz = 4 + (p.size % 6);
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              top: 0,
              left: p.left,
              animation: `weatherSnowFall ${p.duration} linear ${p.delay} infinite`,
              willChange: "transform, opacity",
            }}
          >
            <span
              style={{
                display: "block",
                width: sz,
                height: sz,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.92)",
                boxShadow: "0 0 4px rgba(255,255,255,0.7)",
                animation: `weatherSnowSway ${(parseFloat(p.duration) * 0.6).toFixed(2)}s ease-in-out ${p.delay} infinite`,
              }}
            />
          </span>
        );
      })}
    </>
  );
}

/* ============ cherry_blossom ============ */
function CherryBlossom() {
  const specs = useRandomSpecs("cherry_blossom", 28);
  return (
    <>
      {specs.map((p, i) => {
        const sz = 8 + (p.size % 6);
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              top: 0,
              left: p.left,
              width: sz,
              height: sz,
              borderRadius: "60% 0 60% 0",
              background: "linear-gradient(135deg, #fbcfe8, #f9a8d4)",
              opacity: 0.9,
              boxShadow: "0 0 3px rgba(244,114,182,0.4)",
              animation: `weatherPetalFall ${p.duration} linear ${p.delay} infinite`,
              willChange: "transform",
            }}
          />
        );
      })}
    </>
  );
}

/* ============ sunshine ============ */
function Sunshine() {
  return (
    <>
      {/* 전체적으로 살짝 밝게 */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 80% 0%, rgba(255,235,150,0.35) 0%, rgba(255,235,150,0) 60%)",
          mixBlendMode: "screen",
        }}
      />
      {/* 비스듬한 햇살 줄기 — 회전된 큰 그라데이션 박스를 살짝 움직임 */}
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: "-30%",
            left: `${-10 + i * 20}%`,
            width: "12%",
            height: "160%",
            transform: "rotate(20deg)",
            background:
              "linear-gradient(180deg, rgba(255,240,170,0.0) 0%, rgba(255,240,170,0.55) 50%, rgba(255,240,170,0.0) 100%)",
            filter: "blur(8px)",
            mixBlendMode: "screen",
            animation: `weatherSunshinePan ${6 + i * 0.7}s ease-in-out ${-i * 0.5}s infinite alternate`,
            willChange: "transform, opacity",
          }}
        />
      ))}
    </>
  );
}

/* ============ firefly ============ */
function Firefly() {
  const specs = useRandomSpecs("firefly", 22);
  return (
    <>
      {/* 살짝 어둡게 */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(20,20,40,0.18)",
        }}
      />
      {specs.map((p, i) => {
        const sz = 6 + (p.size % 5);
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              left: p.left,
              top: `${50 + (i % 5) * 8}%`,
              width: sz,
              height: sz,
              borderRadius: "50%",
              background: "rgba(252, 211, 77, 0.95)",
              boxShadow:
                "0 0 8px rgba(252,211,77,0.9), 0 0 16px rgba(250,204,21,0.7)",
              animation: `weatherFireflyDrift ${4 + (parseFloat(p.duration) * 1.5).toFixed(2)}s ease-in-out ${p.delay} infinite`,
              willChange: "transform, opacity",
            }}
          />
        );
      })}
    </>
  );
}

/* ============ stars ============ */
function Stars() {
  const specs = useRandomSpecs("stars", 40);
  return (
    <>
      {/* 약간 어둡게 (밤 분위기) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(10,10,30,0.22)",
        }}
      />
      {specs.map((p, i) => {
        const sz = 2 + (p.size % 3);
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              left: p.left,
              top: `${(i * 7) % 100}%`,
              width: sz,
              height: sz,
              borderRadius: "50%",
              background: "#fff",
              boxShadow: "0 0 4px rgba(255,255,255,0.95), 0 0 8px rgba(200,220,255,0.7)",
              animation: `weatherStarTwinkle ${2 + (parseFloat(p.duration) * 0.6).toFixed(2)}s ease-in-out ${p.delay} infinite`,
              willChange: "opacity, transform",
            }}
          />
        );
      })}
    </>
  );
}

/* ============ autumn_leaves ============ */
function AutumnLeaves() {
  const specs = useRandomSpecs("autumn_leaves", 22);
  const colors = ["#ea580c", "#dc2626", "#d97706", "#b45309", "#a16207"];
  return (
    <>
      {specs.map((p, i) => {
        const sz = 10 + (p.size % 6);
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
              borderRadius: "50% 10% 50% 10%",
              background: color,
              opacity: 0.92,
              boxShadow: "0 0 2px rgba(0,0,0,0.2)",
              animation: `weatherLeafFall ${p.duration} linear ${p.delay} infinite`,
              willChange: "transform",
            }}
          />
        );
      })}
    </>
  );
}
