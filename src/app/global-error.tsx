"use client";

// 루트 layout 자체가 throw 하는 경우를 위한 마지막 보루.
// 이 파일은 자체적인 <html> / <body> 를 포함해야 합니다.

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[사과정원] 글로벌 에러:", error);
  }, [error]);

  return (
    <html lang="ko">
      <body
        style={{
          fontFamily:
            '"Pretendard Variable","Pretendard",-apple-system,system-ui,sans-serif',
          background: "linear-gradient(180deg,#fff8ec 0%,#fdeed1 100%)",
          color: "#3a2a1a",
          minHeight: "100vh",
          margin: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        <div
          style={{
            maxWidth: "640px",
            width: "100%",
            background: "#fff",
            borderRadius: "24px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
            padding: "32px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "44px", marginBottom: "8px" }}>🪴</div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 8px" }}>
            잠시 멈췄어요
          </h1>
          <p style={{ color: "#7a6a55", lineHeight: 1.6 }}>
            예상치 못한 오류가 발생했어요. 잠시 후 다시 시도해주세요.
          </p>
          <pre
            style={{
              marginTop: "16px",
              textAlign: "left",
              fontSize: "12px",
              background: "#fdeed1",
              borderRadius: "12px",
              padding: "12px",
              overflow: "auto",
              maxHeight: "192px",
            }}
          >
            {error?.message}
            {error?.digest ? `\n\ndigest: ${error.digest}` : ""}
          </pre>
          <button
            onClick={reset}
            style={{
              marginTop: "20px",
              padding: "10px 20px",
              borderRadius: "12px",
              background: "#d63b3b",
              color: "#fff",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
            }}
          >
            다시 시도
          </button>
        </div>
      </body>
    </html>
  );
}
