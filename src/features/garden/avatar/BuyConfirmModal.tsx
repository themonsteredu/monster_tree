"use client";

// 유료 아이템 구매 확인 모달 — 아바타 아이템 / 마당 소품 공용.
// 포인트 차감은 나무 성장 포인트(total_points)에서 이뤄지므로
// "나무 단계가 내려갈 수 있다" 는 안내를 반드시 보여준다 (기존 상점과 동일 정책).

export function BuyConfirmModal({
  itemName,
  imageUrl,
  price,
  balance,
  busy,
  errorMessage,
  onConfirm,
  onCancel,
}: {
  itemName: string;
  imageUrl?: string | null;
  price: number;
  balance: number | null; // null = 아직 확인 안 됨
  busy: boolean;
  errorMessage: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${itemName} 구매 확인`}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(61,40,24,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 300,
      }}
      onClick={(e) => {
        // 부모 시트의 배경 탭(닫기)으로 전파 방지.
        e.stopPropagation();
        if (!busy) onCancel();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fffaf2",
          border: "2px solid #f0c050",
          borderRadius: 20,
          padding: "22px 20px",
          width: "100%",
          maxWidth: 320,
          textAlign: "center",
          boxShadow: "0 20px 60px rgba(61,40,24,0.35)",
        }}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={itemName}
            style={{
              width: 72,
              height: 72,
              objectFit: "contain",
              margin: "0 auto 8px",
              display: "block",
              background: "#fff5e6",
              border: "1.5px solid #e8d8b8",
              borderRadius: 12,
              padding: 4,
            }}
          />
        ) : (
          <div style={{ fontSize: 40, marginBottom: 6 }}>🛍️</div>
        )}
        <div style={{ fontSize: 16, fontWeight: 800, color: "#3d2818", marginBottom: 4 }}>
          {itemName}
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, color: "#F26522", marginBottom: 10 }}>
          {price} P
        </div>
        <div
          style={{
            background: "#fff5d6",
            border: "1.5px solid #f0c050",
            borderRadius: 12,
            padding: "8px 10px",
            fontSize: 12,
            fontWeight: 700,
            color: "#3d2818",
            lineHeight: 1.5,
            marginBottom: 10,
          }}
        >
          포인트는 나무 성장에도 쓰여요 — 정말 살까요?
          <div style={{ fontSize: 11, fontWeight: 600, color: "#8a6f52", marginTop: 2 }}>
            포인트가 줄면 나무 단계가 내려갈 수 있어요.
          </div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#8a6f52", marginBottom: 12 }}>
          내 잔액: {balance === null ? "확인 중..." : `${balance} P`}
        </div>
        {errorMessage && (
          <div
            role="alert"
            style={{
              background: "#fde8e4",
              color: "#a83020",
              padding: "8px 10px",
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 700,
              marginBottom: 12,
            }}
          >
            {errorMessage}
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{
              flex: 1,
              padding: "11px 0",
              border: "1.5px solid #d6c2a0",
              background: "#fff",
              color: "#3d2818",
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 13,
              cursor: busy ? "default" : "pointer",
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            style={{
              flex: 1.4,
              padding: "11px 0",
              border: "none",
              background: busy ? "#d6c2a0" : "#F26522",
              color: "#fff",
              borderRadius: 10,
              fontWeight: 800,
              fontSize: 13,
              cursor: busy ? "default" : "pointer",
            }}
          >
            {busy ? "구매 중..." : `${price} P 로 구매`}
          </button>
        </div>
      </div>
    </div>
  );
}
