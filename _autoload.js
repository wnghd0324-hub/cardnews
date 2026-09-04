/* =====================================================================
   Orange 카드뉴스 · 초안 자동주입 (_autoload.js)
   ─────────────────────────────────────────────────────────────────────
   템플릿은 <script src="./_editor.js"> 대신 이 파일을 로드한다.
   · 주소에 ?draft=<id> 가 있으면 → drafts/<id>.json 을 읽어
     window.CARDS 를 초안으로 교체하고, 캡션 상자를 띄운 뒤 편집기 부팅.
   · 없으면 → 그냥 편집기 부팅 (평소 편집).
   초안이 편집기 "부팅 전"에 들어가야 하므로, 여기서 _editor.js 를 직접 로드한다.
   ===================================================================== */
(function () {
  function loadEditor() {
    var s = document.createElement("script");
    s.src = "./_editor.js?v=8";   // 버전 올려 폰 캐시 방지
    document.body.appendChild(s);
  }

  // 캡션을 화면 위에 보여주는 상자 (인스타에 복붙용)
  function showCaption(text) {
    if (!text) return;
    var box = document.createElement("div");
    box.className = "ed-draft-caption";
    var btn = document.createElement("button");
    btn.className = "ed-btn"; btn.textContent = "📋 캡션 복사";
    btn.onclick = function () {
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(
        function () { btn.textContent = "✅ 복사됨"; setTimeout(function () { btn.textContent = "📋 캡션 복사"; }, 1500); },
        function () {
          var ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
          document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} document.body.removeChild(ta);
          btn.textContent = "✅ 복사됨"; setTimeout(function () { btn.textContent = "📋 캡션 복사"; }, 1500);
        }
      );
    };
    var h = document.createElement("div"); h.className = "cap-h"; h.textContent = "📝 인스타 캡션";
    var body = document.createElement("div"); body.className = "cap-body"; body.textContent = text;
    box.appendChild(h); box.appendChild(btn); box.appendChild(body);
    document.body.insertBefore(box, document.body.firstChild);
  }

  var m = location.search.match(/[?&]draft=([^&]+)/);
  if (!m) { loadEditor(); return; }          // 초안 없음 → 평소 편집

  var id = decodeURIComponent(m[1]).replace(/[^\w\-.]/g, "");   // 안전한 파일명만
  fetch("./drafts/" + id + ".json", { cache: "no-store" })
    .then(function (r) { if (!r.ok) throw new Error("draft not found"); return r.json(); })
    .then(function (d) {
      if (d && Array.isArray(d.cards)) window.CARDS = d.cards;   // 초안으로 교체
      if (window.renderDeck) window.renderDeck();                // 미리보기 다시 그림
      showCaption(d && d.caption);
      loadEditor();                                             // 그다음 편집기 부팅
    })
    .catch(function () { loadEditor(); });                       // 실패해도 편집기는 뜸
})();
