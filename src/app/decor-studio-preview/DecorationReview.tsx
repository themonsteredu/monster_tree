"use client";
import { useState } from "react";
import { ForestYardPreview } from "@/app/admin/yard-preview/ForestYardPreview";
import { RoomScene } from "@/features/social/RoomScene";
import { createDefaultHome } from "@/lib/social/model";

export function DecorationReview() {
  const [room, setRoom] = useState(false);
  const [home, setHome] = useState(createDefaultHome);
  return <>
    <nav style={{ display: "flex", justifyContent: "center", gap: 12, padding: 12 }}>
      <a href="/tree/decor-studio-preview?mobile=1" style={{ minHeight: 44 }}>휴대폰 화면</a>
      <button type="button" onClick={() => setRoom(false)} style={{ minHeight: 44 }}>마당 편집 테스트</button>
      <button type="button" onClick={() => setRoom(true)} style={{ minHeight: 44 }}>집 편집 테스트</button>
    </nav>
    {room ? <main style={{ maxWidth: 700, margin: "auto", padding: 16 }}><p>테스트 모드 — 기록 저장 안 됨</p><RoomScene home={home} ownerName="미리보기" editing onChange={setHome} /></main> : <ForestYardPreview />}
  </>;
}
