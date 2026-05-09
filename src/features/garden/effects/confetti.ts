// 사과정원 컨페티 효과 — TV / /me 양쪽이 공유.
//
// fireConfetti(harvest, nonHarvestY?)
//   harvest=true:  좌우 풍성한 2.5초 컨페티 샤워 (수확/단계업 8단계)
//   harvest=false: 단일 burst — TV 는 y=0.6, /me 는 y=0.55 호출
// firePtCelebration: /me 전용 — +pt 시 워터/잎 컨페티 큰 샤워.

import confetti from "canvas-confetti";

const BASE_COLORS = ["#f0c050", "#f04848", "#5e9c38", "#c87fdb", "#ffb8d4"];

export function fireConfetti(harvest: boolean, nonHarvestY: number = 0.6): void {
  if (harvest) {
    const end = Date.now() + 2_500;
    const tick = () => {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 65,
        origin: { x: 0, y: 0.7 },
        colors: BASE_COLORS,
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 65,
        origin: { x: 1, y: 0.7 },
        colors: BASE_COLORS,
      });
      if (Date.now() < end) requestAnimationFrame(tick);
    };
    tick();
  } else {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: nonHarvestY },
      colors: BASE_COLORS,
    });
  }
}

// /me 의 +pt 화려한 컨페티 (워터 + 잎 색).
// 화면 위쪽 중앙 큰 burst 1차 + 살짝 늦은 좌우 burst 2차.
export function firePtCelebration(): void {
  const waterColors = ["#7fc6e8", "#5cb8e8", "#a8e0ff", "#c8eba0", "#a8e070", "#ffffff"];
  confetti({
    particleCount: 120,
    spread: 110,
    startVelocity: 38,
    origin: { x: 0.5, y: 0.25 },
    colors: waterColors,
    scalar: 1.3,
    gravity: 0.9,
    ticks: 220,
  });
  setTimeout(() => {
    confetti({
      particleCount: 50,
      spread: 60,
      startVelocity: 35,
      angle: 60,
      origin: { x: 0.1, y: 0.4 },
      colors: waterColors,
      scalar: 1.1,
    });
    confetti({
      particleCount: 50,
      spread: 60,
      startVelocity: 35,
      angle: 120,
      origin: { x: 0.9, y: 0.4 },
      colors: waterColors,
      scalar: 1.1,
    });
  }, 180);
}
