// 간단한 chroma-key 배경 제거 — 이미지 네 모서리 색을 평균내서
// 배경으로 간주하고, 그 색과 가까운 픽셀의 알파를 0 으로 만든다.
// 흰색/크림색/연한 단색 배경 + 투명 PNG 만들기 정도에 효과적.
// 복잡한 배경(그라데이션, 패턴, 그림자) 에는 부정확할 수 있다.

type RGB = { r: number; g: number; b: number };

const DEFAULT_THRESHOLD = 36; // 0~441 (sqrt(3*255^2) ≈ 441), 30~50 가 적당
const SOFT_EDGE_FACTOR = 1.6; // threshold * 1.6 까지는 알파를 부드럽게

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지 로드 실패"));
    img.src = URL.createObjectURL(file);
  });
}

function pixelAt(data: Uint8ClampedArray, width: number, x: number, y: number): RGB {
  const i = (y * width + x) * 4;
  return { r: data[i], g: data[i + 1], b: data[i + 2] };
}

function avgColor(colors: RGB[]): RGB {
  let r = 0, g = 0, b = 0;
  for (const c of colors) {
    r += c.r; g += c.g; b += c.b;
  }
  return {
    r: Math.round(r / colors.length),
    g: Math.round(g / colors.length),
    b: Math.round(b / colors.length),
  };
}

function colorDist(a: RGB, b: RGB): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

export type RemoveBgOptions = {
  threshold?: number;
  outputName?: string;
};

export async function removeBackground(
  file: File,
  options: RemoveBgOptions = {},
): Promise<File> {
  const { threshold = DEFAULT_THRESHOLD, outputName } = options;

  const img = await loadImageFromFile(file);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context 사용 불가");

  ctx.drawImage(img, 0, 0);
  URL.revokeObjectURL(img.src);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const w = canvas.width;
  const h = canvas.height;

  // 네 모서리에서 작은 박스(5x5) 평균색 → 배경 색
  const sampleBox = (sx: number, sy: number): RGB => {
    const colors: RGB[] = [];
    for (let y = sy; y < sy + 5 && y < h; y++) {
      for (let x = sx; x < sx + 5 && x < w; x++) {
        colors.push(pixelAt(data, w, x, y));
      }
    }
    return avgColor(colors);
  };
  const corners = [
    sampleBox(0, 0),
    sampleBox(Math.max(0, w - 5), 0),
    sampleBox(0, Math.max(0, h - 5)),
    sampleBox(Math.max(0, w - 5), Math.max(0, h - 5)),
  ];
  const bg = avgColor(corners);

  const softEdge = threshold * SOFT_EDGE_FACTOR;
  for (let i = 0; i < data.length; i += 4) {
    const px: RGB = { r: data[i], g: data[i + 1], b: data[i + 2] };
    const d = colorDist(px, bg);
    if (d < threshold) {
      data[i + 3] = 0;
    } else if (d < softEdge) {
      // threshold ~ softEdge 사이는 점진적 알파 감소 (가장자리 부드럽게)
      const t = (d - threshold) / (softEdge - threshold);
      data[i + 3] = Math.round(data[i + 3] * t);
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error("PNG 변환 실패"));
      },
      "image/png",
    );
  });

  const baseName = outputName ?? file.name.replace(/\.[^.]+$/, "") + ".png";
  return new File([blob], baseName, { type: "image/png" });
}
