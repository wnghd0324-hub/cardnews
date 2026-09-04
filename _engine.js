/* =====================================================================
   Orange 카드뉴스 · 공유 엔진
   ─────────────────────────────────────────────────────────────────────
   각 템플릿(story.html / drop.html / interview.html)은 CARDS 배열만
   정의하고 이 파일을 부릅니다. 렌더링 + PNG 저장을 담당합니다. (건드릴 필요 없음)

   카드 공통 필드:
   - image  : "./img/01.jpg" 또는 URL  (배경 사진. 없으면 안내 표시)
   - theme  : "light"(흰 글씨·기본) | "dark"(밝은 사진용 검은 글씨)
   - handle : "@계정명"  (선택, 우하단)
   - layout : 아래 종류 중 하나 (생략 시 "story")

   layout 별 추가 필드:
   ① "story"  (기본) … eyebrow?(상단 라벨) / head / body
   ② "showcase" (사진 위주) … caption?(좌하단 칩). 글 없이 사진만 보여줄 때
   ③ "spec"   (스펙/가격) … spec_title / specs:[["가격","139,000원"],...] / note?
   ④ "quote"  (인터뷰 풀쿼트) … quote / by?

   강조 도구(head/body/quote 안에서): <span class="box">검정박스</span> · <span class="xl">크게</span>
   ===================================================================== */

const deck = document.getElementById("deck");

window.renderDeck = function () {
  deck.innerHTML = "";
  (window.CARDS || []).forEach((c, i) => {
    const stage = document.createElement("div");
    stage.className = "stage";

    const card = document.createElement("div");
    card.className = "card theme-" + (c.theme === "dark" ? "dark" : "light");
    card.id = "card" + i;
    card.innerHTML = renderCard(c);

    stage.appendChild(card);
    deck.appendChild(stage);

    const ctrl = document.createElement("div");
    ctrl.className = "row";
    const btn = document.createElement("button");
    btn.className = "saveBtn";
    btn.textContent = `이 카드 PNG 저장 (${i + 1}번)`;
    btn.onclick = () => saveCard(i);
    ctrl.appendChild(btn);
    deck.appendChild(ctrl);
  });
};
window.renderDeck();
window.saveCard = saveCard; window.saveAll = saveAll;

/* ---- 카드 한 장의 내부 HTML 만들기 (layout 분기) ---- */
function renderCard(c) {
  const bg = window.photoDiv(c);   // 공용 사진 처리(_photo.js): 위치조정·확대·자동화질
  const handle = c.handle ? `<div class="handle">${c.handle}</div>` : "";

  let scrim = `<div class="scrim"></div>`;
  let content = "";

  switch (c.layout) {
    case "showcase":
      scrim = c.caption ? `<div class="scrim"></div>` : "";       // 캡션 있을 때만 살짝 어둡게
      content = c.caption ? `<div class="caption">${nl(c.caption)}</div>` : "";
      return bg + scrim + content + handle;

    case "spec":
      scrim = `<div class="scrim strong"></div>`;
      content = `<div class="content">
        ${c.spec_title ? `<div class="spec-title">${nl(c.spec_title)}</div>` : ""}
        ${renderSpecs(c.specs)}
        ${c.note ? `<div class="spec-note">${nl(c.note)}</div>` : ""}
      </div>`;
      return bg + scrim + content + handle;

    case "quote":
      content = `<div class="content">
        <div class="quote-wrap">
          <span class="qmark">“</span>
          <div class="quote-text">${nl(c.quote || "")}</div>
          ${c.by ? `<div class="quote-by">— ${nl(c.by)}</div>` : ""}
        </div>
      </div>`;
      return bg + scrim + content + handle;

    default: // "story"
      content = `<div class="content">
        ${c.eyebrow ? `<div class="eyebrow">${nl(c.eyebrow)}</div>` : ""}
        ${c.head ? `<div class="head">${nl(c.head)}</div>` : ""}
        ${c.body ? `<div class="body">${nl(c.body)}</div>` : ""}
      </div>`;
      return bg + scrim + content + handle;
  }
}

function renderSpecs(specs) {
  if (!Array.isArray(specs) || !specs.length) return "";
  const rows = specs.map(([k, v]) =>
    `<div class="spec-row"><div class="k">${nl(k)}</div><div class="v">${nl(v)}</div></div>`
  ).join("");
  return `<div class="spec-list">${rows}</div>`;
}

/* \n → <br> (입력 편의) */
function nl(s) { return String(s).replace(/\n/g, "<br>"); }

async function saveCard(i) {
  await window.saveCardCanvas(i, window.CARDS[i]);   // 공용 저장(_photo.js): 자동 고화질
}

async function saveAll() {
  const n = (window.CARDS || []).length;
  for (let i = 0; i < n; i++) { await saveCard(i); await new Promise(r => setTimeout(r, 400)); }
}
