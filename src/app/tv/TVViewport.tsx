"use client";

// TV 전용 뷰포트 고정 (/tree/tv).
//
// 문제: 안드로이드 TV 박스 크롬은 패널이 1920×1080 이어도 픽셀 밀도(dpr 2) 때문에
//       `width=device-width` 를 960 CSS px 로 보고한다. 그래서 Tailwind `lg`(1024px)
//       브레이크포인트가 걸리지 않고 태블릿 레이아웃(스포트라이트 위 / 그리드 아래로
//       세로 스택)이 떠서 PC 화면과 다르게 보였다.
//
// 해결: 뷰포트 폭을 1920 으로 고정하면 브라우저가 화면 폭에 맞춰 축소 렌더링하므로
//       레이아웃이 1920×1080 PC 브라우저와 동일해진다.
//
// - 데스크탑 브라우저는 viewport meta 를 무시하므로 PC 화면에는 영향이 없다.
// - 인라인 스크립트로 파싱 시점에 덮어써서 모바일 레이아웃이 한 번 깜빡이는 걸 막는다.
// - 하이드레이션 때 React 가 루트 layout 의 viewport meta 를 **하나 더** 붙이는데,
//   브라우저는 마지막 meta 를 쓰기 때문에 그대로 두면 다시 device-width 로 돌아간다.
//   그래서 head 를 MutationObserver 로 감시하며 viewport meta 전부를 1920 으로 유지한다.
//   (router.refresh() 로 meta 가 다시 그려져도 유지됨)
// - 핸드폰으로 관찰할 때는 `?fit=device` 를 붙이면 이 고정을 끄고 기존 반응형으로 본다.

import { useEffect } from "react";

const TV_VIEWPORT_WIDTH = 1920;
const TV_VIEWPORT_CONTENT = `width=${TV_VIEWPORT_WIDTH}, user-scalable=no`;

const INLINE_SCRIPT = `(function(){var c=${JSON.stringify(TV_VIEWPORT_CONTENT)};var l=document.querySelectorAll('meta[name="viewport"]');if(!l.length){var m=document.createElement('meta');m.setAttribute('name','viewport');m.setAttribute('content',c);document.head.appendChild(m);}else{for(var i=0;i<l.length;i++)l[i].setAttribute('content',c);}})();`;

export function TVViewport() {
  useEffect(() => {
    const apply = () => {
      const metas = document.querySelectorAll('meta[name="viewport"]');
      if (metas.length === 0) {
        const meta = document.createElement("meta");
        meta.setAttribute("name", "viewport");
        meta.setAttribute("content", TV_VIEWPORT_CONTENT);
        document.head.appendChild(meta);
        return;
      }
      // 변경이 있을 때만 setAttribute → observer 무한 루프 방지
      metas.forEach((meta) => {
        if (meta.getAttribute("content") !== TV_VIEWPORT_CONTENT) {
          meta.setAttribute("content", TV_VIEWPORT_CONTENT);
        }
      });
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["content"],
    });
    return () => observer.disconnect();
  }, []);

  return <script dangerouslySetInnerHTML={{ __html: INLINE_SCRIPT }} />;
}
