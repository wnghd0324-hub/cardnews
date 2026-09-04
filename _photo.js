/* =====================================================================
   Orange 카드뉴스 · 공용 사진 처리 (_photo.js)
   ─────────────────────────────────────────────────────────────────────
   모든 템플릿이 사진을 "같은 방식"으로 그리고 저장하게 해주는 부품.
   · 위치조정(c.pos) · 확대(c.zoom) · 원본크기(c._w/_h) 반영
   · 저장 시 원본을 안 늘리는 선에서 1~3배 자동 고화질(bestScale)
   각 템플릿은 render 에서 window.photoDiv(c) 를 쓰고,
   저장은 window.saveCardCanvas(i, CARDS[i]) 를 부르면 됩니다.
   ===================================================================== */
(function () {
  var CW = 1080, CH = 1350;   // 카드 규격

  window.imgSize = function (src) {
    return new Promise(function (res) {
      if (!src) return res(null);
      var im = new Image();
      im.onload = function () { res({ w: im.naturalWidth, h: im.naturalHeight }); };
      im.onerror = function () { res(null); };
      im.src = src;
    });
  };

  // 사진 배경 스타일 (확대는 transform 대신 background-size 로 → 확대 시 상하좌우 드래그 + 화질 유지)
  window.photoStyle = function (c) {
    var pos = (c && c.pos) || "50% 50%", zoom = (c && c.zoom) || 1, size = "cover";
    if (c && c._w && c._h) {
      var cover = Math.max(CW / c._w, CH / c._h);
      size = (cover * c._w * zoom).toFixed(1) + "px " + (cover * c._h * zoom).toFixed(1) + "px";
    }
    return "background-image:url('" + (c && c.image) + "');background-size:" + size + ";background-position:" + pos;
  };

  window.photoDiv = function (c) {
    return (c && c.image)
      ? '<div class="photo" style="' + window.photoStyle(c) + '"></div>'
      : '<div class="placeholder">⬆ 사진을 넣어주세요 (image)</div>';
  };

  // 원본을 안 늘리는 선에서 낼 수 있는 최대 저장배율
  window.bestScale = async function (c) {
    var sz = await window.imgSize(c && c.image); if (!sz) return 2;
    var zoom = (c && c.zoom) || 1;
    var cover = Math.max(CW / sz.w, CH / sz.h);
    var s = ((CW / cover) / zoom) / CW;
    return Math.max(1, Math.min(3, Math.round(s * 100) / 100));
  };

  // 카드 한 장 PNG 저장 (자동 고화질)
  window.saveCardCanvas = async function (i, c) {
    var el = document.getElementById("card" + i);
    var scale = await window.bestScale(c);
    var cv = await html2canvas(el, {
      width: CW, height: CH, scale: scale, backgroundColor: null, useCORS: true,
      onclone: function (d) { d.getElementById("card" + i).style.transform = "none"; },
    });
    var name = "cardnews_" + String(i + 1).padStart(2, "0") + ".png";
    if (window.edShareOrDownload) { await window.edShareOrDownload(cv, name); }
    else { var a = document.createElement("a"); a.download = name; a.href = cv.toDataURL("image/png"); a.click(); }
  };
})();
