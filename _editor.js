/* =====================================================================
   Orange 카드뉴스 · 공용 편집기 (_editor.js)
   ─────────────────────────────────────────────────────────────────────
   3가지 모드로 동작:
   ① 직접 열기   : 템플릿 html 을 직접 열면 그 페이지에 편집 패널이 붙음
   ② iframe 내부 : 통합 편집기(editor.html)의 미리보기 창으로 열리면,
                   패널 대신 부모(허브)와 postMessage 로 대화(임베드 모드)
   ③ 통합 허브   : editor.html (window.EDITOR_HUB 설정) → 드롭다운으로 템플릿 선택,
                   미리보기는 iframe, 편집은 패널(메시지로 iframe 제어)

   템플릿이 노출할 것: window.CARDS, window.renderDeck(), window.EDITOR_SCHEMA
                      (+ window.saveCard / window.saveAll)
   type: text | textarea(asList) | rich(emph) | number | select | image
   ===================================================================== */
(function () {
  // ================= 공용 유틸 =================
  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function esc(s) { return String(s).replace(/[&<>]/g, function (m) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]; }); }
  function isData(v) { return typeof v === "string" && v.indexOf("data:") === 0; }
  function clamp(v) { return Math.max(0, Math.min(100, v)); }
  function parsePos(s) {
    var m = String(s).match(/(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%/);
    return m ? { x: +m[1], y: +m[2] } : { x: 50, y: 50 };
  }
  function cleanRich(html) {
    return html
      .replace(/<div><br><\/div>/gi, "<br>")
      .replace(/<div>/gi, "<br>").replace(/<\/div>/gi, "")
      .replace(/&nbsp;/g, " ")
      .replace(/ style="[^"]*"/gi, "")
      .replace(/^(<br>)+/i, "").trim();
  }
  function emphAncestor(node, host, cls) {   // 선택 위치가 이미 강조 안(span.cls)인지 찾기
    while (node && node !== host) {
      if (node.nodeType === 1 && node.classList && node.classList.contains(cls)) return node;
      node = node.parentNode;
    }
    return null;
  }
  function unwrapRange(host, cls, r) {   // 선택 부분만 강조 해제 (앞/뒤는 박스 유지)
    var hit = emphAncestor(r.commonAncestorContainer, host, cls) || emphAncestor(r.startContainer, host, cls) || emphAncestor(r.endContainer, host, cls);
    if (!hit) return false;
    var parent = hit.parentNode;
    var fullR = document.createRange(); fullR.selectNodeContents(hit);
    // 선택을 박스 범위 안으로 clamp
    var mid = document.createRange();
    if (r.compareBoundaryPoints(Range.START_TO_START, fullR) < 0) mid.setStart(fullR.startContainer, fullR.startOffset);
    else mid.setStart(r.startContainer, r.startOffset);
    if (r.compareBoundaryPoints(Range.END_TO_END, fullR) > 0) mid.setEnd(fullR.endContainer, fullR.endOffset);
    else mid.setEnd(r.endContainer, r.endOffset);
    // 박스 전체를 덮으면 통째로 해제
    if (mid.compareBoundaryPoints(Range.START_TO_START, fullR) <= 0 && mid.compareBoundaryPoints(Range.END_TO_END, fullR) >= 0) {
      while (hit.firstChild) parent.insertBefore(hit.firstChild, hit);
      parent.removeChild(hit); if (parent.normalize) parent.normalize();
      return true;
    }
    // [앞]box + [선택]plain + [뒤]box 로 재구성
    var beforeR = document.createRange(); beforeR.setStart(fullR.startContainer, fullR.startOffset); beforeR.setEnd(mid.startContainer, mid.startOffset);
    var afterR = document.createRange(); afterR.setStart(mid.endContainer, mid.endOffset); afterR.setEnd(fullR.endContainer, fullR.endOffset);
    var frag = document.createDocumentFragment();
    var bf = beforeR.cloneContents();
    if (bf.textContent && bf.textContent.length) { var b = document.createElement("span"); b.className = cls; b.appendChild(bf); frag.appendChild(b); }
    frag.appendChild(mid.cloneContents());   // 선택 부분 = 강조 없음
    var af = afterR.cloneContents();
    if (af.textContent && af.textContent.length) { var a = document.createElement("span"); a.className = cls; a.appendChild(af); frag.appendChild(a); }
    parent.replaceChild(frag, hit);
    return true;
  }
  function toggleSel(host, cls, toast) {   // 강조 토글: 걸렸으면(부분/전체) 해제, 아니면 걸기
    var s = window.getSelection();
    if (!s || s.rangeCount === 0 || s.isCollapsed) { toast("먼저 강조할 글자를 드래그해서 선택하세요"); return; }
    var r = s.getRangeAt(0);
    if (!host.contains(r.commonAncestorContainer)) return;
    if (unwrapRange(host, cls, r)) { s.removeAllRanges(); return; }
    var span = document.createElement("span"); span.className = cls || "red";   // 아니면 강조 걸기
    try { r.surroundContents(span); } catch (e) { span.appendChild(r.extractContents()); r.insertNode(span); }
    s.removeAllRanges();
  }
  function stringify(cards) {
    var items = cards.map(function (c) {
      var keys = Object.keys(c).filter(function (k) { return k !== "_w" && k !== "_h"; }).map(function (k) {
        var v = c[k];
        var sv = typeof v === "string" && v.length > 300 ? '"…(사진 데이터 생략, 파일 경로로 교체하세요)…"' : JSON.stringify(v);
        return "    " + k + ": " + sv;
      });
      return "  {\n" + keys.join(",\n") + "\n  }";
    });
    return "[\n" + items.join(",\n") + "\n]";
  }
  function copy(txt) {
    var ta = document.createElement("textarea"); ta.value = txt;
    ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta);
    ta.select(); try { document.execCommand("copy"); } catch (e) {} document.body.removeChild(ta);
  }
  var toastEl;
  function toast(msg) {
    if (!toastEl) { toastEl = el("div", "ed-toast"); document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(function () { toastEl.classList.remove("show"); }, 2600);
  }
  function isFramed() { try { return window.parent && window.parent !== window; } catch (e) { return true; } }

  // 저장: 폰(공유 지원)이면 공유 시트(→사진첩 저장·인스타 공유), PC면 다운로드
  window.edShareOrDownload = async function (canvas, filename) {
    var blob = await new Promise(function (res) { try { canvas.toBlob(res, "image/png"); } catch (e) { res(null); } });
    if (blob && navigator.canShare) {
      try {
        var file = new File([blob], filename, { type: "image/png" });
        if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; }
      } catch (e) { if (e && e.name === "AbortError") return; }   // 사용자가 취소하면 다운로드 안 함
    }
    var a = document.createElement("a"); a.download = filename;
    a.href = blob ? URL.createObjectURL(blob) : canvas.toDataURL("image/png");
    a.click();
    if (blob) setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  };

  // ================= 패널 UI (DRV = 데이터/미리보기 연결부) =================
  // DRV: schema(), cards(), render(), save(i), saveAll(), select(i), selectorEl?
  function buildEditor(DRV) {
    var old = document.querySelector(".ed-panel"); if (old) old.remove();

    var S = DRV.schema();
    var sel = 0;
    document.documentElement.style.setProperty("--ed-emph", S.emphColor || "#EE2E24");

    var panel = el("div", "ed-panel");
    panel.innerHTML =
      '<div class="ed-head"><div class="ed-sel-slot"></div><div class="t">' + esc(S.title || "카드 편집") + "</div>" +
        '<div class="s">' + esc(S.note || "글자·사진을 바꾸면 미리보기에 바로 반영돼요.") + "</div></div>" +
      '<div class="ed-tabs"></div>' +
      '<div class="ed-body"></div>' +
      '<div class="ed-foot">' +
        '<div class="rowb"><button class="ed-btn ed-save" data-act="png">이 카드 PNG</button>' +
          '<button class="ed-btn" data-act="pngall">전체 PNG</button></div>' +
        '<button class="ed-btn" data-act="export">코드 내보내기 (파일에 붙여넣기용)</button>' +
      "</div>";
    document.body.appendChild(panel);

    if (DRV.selectorEl) panel.querySelector(".ed-sel-slot").appendChild(DRV.selectorEl);
    var tabs = panel.querySelector(".ed-tabs");
    var body = panel.querySelector(".ed-body");
    panel.querySelector('[data-act="png"]').onclick = function () { DRV.save(sel); };
    panel.querySelector('[data-act="pngall"]').onclick = function () { DRV.saveAll(); };
    panel.querySelector('[data-act="export"]').onclick = exportCode;

    buildTabs(); select(0);

    function redraw() { DRV.render(); DRV.select(sel, false); }   // 타이핑 중엔 스크롤 안 함

    function buildTabs() {
      tabs.innerHTML = "";
      DRV.cards().forEach(function (c, i) {
        var t = el("button", "ed-tab" + (i === sel ? " on" : "")); t.textContent = (i + 1) + "";
        t.onclick = function () { select(i); };
        tabs.appendChild(t);
      });
      var add = el("button", "ed-tab add"); add.textContent = "＋"; add.title = "카드 추가"; add.onclick = addCard;
      tabs.appendChild(add);
    }
    function addCard() {
      var arr = DRV.cards();
      arr.push(JSON.parse(JSON.stringify(arr[arr.length - 1] || {})));
      redraw(); buildTabs(); select(arr.length - 1);
    }
    function delCard() {
      var arr = DRV.cards();
      if (arr.length <= 1) return toast("마지막 카드는 지울 수 없어요");
      arr.splice(sel, 1); sel = Math.max(0, sel - 1);
      redraw(); buildTabs(); select(sel);
    }
    function select(i) {
      sel = i;
      Array.prototype.forEach.call(tabs.querySelectorAll(".ed-tab"), function (t, k) {
        t.classList.toggle("on", k === sel && !t.classList.contains("add"));
      });
      renderFields(); DRV.select(sel, true);   // 페이지 탭 이동 때만 그 카드로 스크롤
    }
    function renderFields() {
      body.innerHTML = "";
      var card = DRV.cards()[sel];
      (S.fields || []).forEach(function (f) {
        if (f.when) { var w = Array.isArray(f.when) ? f.when : [f.when]; if (w.indexOf(card.layout) < 0) return; }
        body.appendChild(fieldFor(f, card));
      });
      var del = el("button", "ed-btn mini"); del.textContent = "이 카드 삭제";
      del.style.marginTop = "4px"; del.onclick = delCard; body.appendChild(del);
    }

    function fieldFor(f, card) {
      var wrap = el("div", "ed-field");
      var lab = el("label"); lab.textContent = f.label || f.key; wrap.appendChild(lab);
      var val = card[f.key] == null ? "" : card[f.key];

      if (f.type === "image") {
        var posKey = f.posKey || "pos", zoomKey = f.zoomKey || "zoom";
        var row = el("div", "ed-img-row");
        var inp = el("input", "ed-in");
        inp.value = isData(val) ? "(올린 사진)" : String(val); inp.placeholder = "./img/01.jpg";
        var up = el("button", "ed-btn"); up.textContent = "사진 올리기";
        var file = el("input"); file.type = "file"; file.accept = "image/*"; file.style.display = "none";

        var focal = el("div", "ed-focal");
        var fimg = el("div", "ed-focal-img");
        var tip = el("div", "ed-focal-tip"); tip.textContent = "✥ 드래그로 위치 조정 · 확대하면 상하좌우 모두 이동";
        focal.appendChild(fimg); focal.appendChild(tip);

        var badge = el("div", "ed-qual"); var qseq = 0;
        function updateQual(src) {
          var my = ++qseq;
          if (!src) { badge.textContent = ""; badge.className = "ed-qual"; return; }
          badge.textContent = "화질 확인 중…"; badge.className = "ed-qual";
          var im = new Image();
          im.onload = function () {
            if (my !== qseq) return;
            var w = im.naturalWidth, h = im.naturalHeight;
            card._w = w; card._h = h; paint(); redraw();
            var lvl = w >= 1620 ? "g" : (w >= 1080 ? "ok" : "bad");
            var txt = lvl === "g" ? "아주 좋음 👍" : (lvl === "ok" ? "충분 ✅" : "작음 ⚠️ 뿌옇게 나올 수 있어요");
            badge.textContent = "원본 " + w + "×" + h + " · 저장화질 " + txt; badge.className = "ed-qual " + lvl;
          };
          im.onerror = function () { if (my !== qseq) return; badge.textContent = ""; badge.className = "ed-qual"; };
          im.src = src;
        }
        updateQual(card[f.key]);

        function paint() {
          if (!card[f.key]) { fimg.style.backgroundImage = "none"; return; }
          fimg.style.backgroundImage = "url('" + card[f.key] + "')";
          fimg.style.backgroundPosition = card[posKey] || "50% 50%";
          var z = card[zoomKey] || 1, w = card._w, h = card._h;
          var tw = focal.clientWidth || 300, th = focal.clientHeight || 375;
          if (w && h) { var cv = Math.max(tw / w, th / h); fimg.style.backgroundSize = (cv * w * z) + "px " + (cv * h * z) + "px"; fimg.style.transform = ""; }
          else { fimg.style.backgroundSize = "cover"; fimg.style.transform = z !== 1 ? "scale(" + z + ")" : ""; }
        }
        paint();

        focal.addEventListener("pointerdown", function (e) {   // 마우스+터치 통합
          if (!card[f.key]) return;
          var p = parsePos(card[posKey] || "50% 50%");
          var start = { x: e.clientX, y: e.clientY, px: p.x, py: p.y }; e.preventDefault();
          try { focal.setPointerCapture(e.pointerId); } catch (_) {}
          function mv(ev) {
            var w = focal.clientWidth || 240, h = focal.clientHeight || 150;
            card[posKey] = Math.round(clamp(start.px - (ev.clientX - start.x) / w * 100)) + "% " +
                           Math.round(clamp(start.py - (ev.clientY - start.y) / h * 100)) + "%";
            paint(); redraw();
          }
          function upp() { focal.removeEventListener("pointermove", mv); focal.removeEventListener("pointerup", upp); focal.removeEventListener("pointercancel", upp); }
          focal.addEventListener("pointermove", mv); focal.addEventListener("pointerup", upp); focal.addEventListener("pointercancel", upp);
        });

        var zwrap = el("div", "ed-zoom");
        var zlab = el("span"); zlab.textContent = "확대";
        var zi = el("input"); zi.type = "range"; zi.min = "100"; zi.max = "260"; zi.step = "1";
        zi.value = String(Math.round((card[zoomKey] || 1) * 100));
        zi.oninput = function () { card[zoomKey] = (+zi.value) / 100; paint(); redraw(); };
        zwrap.appendChild(zlab); zwrap.appendChild(zi);

        inp.oninput = function () {
          card[f.key] = inp.value === "(올린 사진)" ? card[f.key] : inp.value;
          card._w = card._h = null; paint(); redraw(); updateQual(card[f.key]);
        };
        up.onclick = function () { file.value = ""; file.click(); };
        file.onchange = function () {
          var fl = file.files[0]; if (!fl) return;
          var r = new FileReader();
          r.onload = function () { card[f.key] = r.result; inp.value = "(올린 사진)"; card._w = card._h = null; paint(); redraw(); updateQual(r.result); };
          r.readAsDataURL(fl);
        };
        row.appendChild(inp); row.appendChild(up);
        wrap.appendChild(row); wrap.appendChild(file); wrap.appendChild(focal); wrap.appendChild(badge); wrap.appendChild(zwrap);

      } else if (f.type === "rich") {
        var ed = el("div", "ed-rich"); ed.contentEditable = "true"; ed.innerHTML = String(val);
        ed.oninput = function () { card[f.key] = cleanRich(ed.innerHTML); redraw(); };
        wrap.appendChild(ed);
        if (f.emph) {
          var cls = f.emphClass || "red";
          var eb = el("button", "ed-btn mini ed-emph-btn"); eb.textContent = f.emphLabel || "선택 글자 강조";
          eb.onclick = function () { toggleSel(ed, cls, toast); card[f.key] = cleanRich(ed.innerHTML); redraw(); };
          wrap.appendChild(eb);
        }

      } else if (f.type === "textarea") {
        var ta = el("textarea", "ed-in");
        ta.value = f.asList && Array.isArray(val) ? val.join("\n") : String(val);
        ta.oninput = function () {
          card[f.key] = f.asList ? ta.value.split("\n").map(function (x) { return x.trim(); }).filter(Boolean) : ta.value;
          redraw();
        };
        wrap.appendChild(ta);

      } else if (f.type === "number") {
        var ni = el("input", "ed-in"); ni.type = "number"; ni.value = String(val);
        ni.oninput = function () { card[f.key] = ni.value === "" ? "" : +ni.value; redraw(); };
        wrap.appendChild(ni);

      } else if (f.type === "select") {
        var se = el("select", "ed-in");
        (f.options || []).forEach(function (o) { var op = el("option"); op.value = o.value; op.textContent = o.label; se.appendChild(op); });
        se.value = String(val || (f.options && f.options[0] && f.options[0].value) || "");
        se.onchange = function () { card[f.key] = se.value; redraw(); };
        wrap.appendChild(se);

      } else {
        var tx = el("input", "ed-in"); tx.value = String(val);
        tx.oninput = function () { card[f.key] = tx.value; redraw(); };
        wrap.appendChild(tx);
      }
      if (f.hint) { var h = el("span", "hint"); h.textContent = f.hint; wrap.appendChild(h); }
      return wrap;
    }

    function exportCode() {
      copy("window.CARDS = " + stringify(DRV.cards()) + ";");
      toast("CARDS 코드가 복사됐어요 → 파일의 CARDS 부분에 붙여넣으면 저장돼요");
    }
  }

  // ================= 모드 판별 & 부팅 =================
  function boot() {
    // 순수 템플릿 미리보기: 주소 뒤에 ?preview → 편집기 안 붙이고 카드 디자인만 보여줌
    if (/[?&]preview\b/i.test(location.search)) { document.body.classList.add("ed-preview"); return; }

    var hasTpl = window.EDITOR_SCHEMA && Array.isArray(window.CARDS) && typeof window.renderDeck === "function";

    // ② iframe 내부(임베드): 부모 허브와 메시지로 대화
    if (hasTpl && isFramed()) {
      document.body.classList.add("ed-embed");
      var curSel = 0;
      function applySel(i) {
        var st = document.querySelectorAll("#deck .stage");
        st.forEach(function (s, k) { s.classList.toggle("ed-sel", k === i); });
        if (st[i]) st[i].scrollIntoView({ block: "center" });
      }
      function sendReady() { window.parent.postMessage({ t: "ready", schema: window.EDITOR_SCHEMA, cards: window.CARDS }, "*"); }
      window.addEventListener("message", function (e) {
        var m = e.data || {};
        if (m.t === "render") { window.CARDS = m.cards; window.renderDeck(); applySel(curSel); }
        else if (m.t === "save") { window.saveCard && window.saveCard(m.i); }
        else if (m.t === "saveAll") { window.saveAll && window.saveAll(); }
        else if (m.t === "select") { curSel = m.i; applySel(m.i); }
        else if (m.t === "ping") { sendReady(); }
      });
      sendReady();
      return;
    }

    // ③ 통합 허브 (editor.html)
    if (window.EDITOR_HUB) {
      var H = window.EDITOR_HUB;
      document.body.classList.add("ed-on", "ed-hub");
      var tplSelect = el("select", "ed-hubselect");
      H.templates.forEach(function (t) { var o = el("option"); o.value = t.file; o.textContent = t.label; tplSelect.appendChild(o); });
      var frame = el("iframe", "ed-frame"); document.body.appendChild(frame);

      var state = { schema: null, cards: null };
      var DRV = {
        selectorEl: tplSelect,
        schema: function () { return state.schema; },
        cards: function () { return state.cards; },
        render: function () { frame.contentWindow.postMessage({ t: "render", cards: state.cards }, "*"); },
        save: function (i) { frame.contentWindow.postMessage({ t: "save", i: i }, "*"); },
        saveAll: function () { frame.contentWindow.postMessage({ t: "saveAll" }, "*"); },
        select: function (i) { frame.contentWindow.postMessage({ t: "select", i: i }, "*"); },
      };
      window.addEventListener("message", function (e) {
        var m = e.data || {};
        if (m.t === "ready") { state.schema = m.schema; state.cards = m.cards; buildEditor(DRV); }
      });
      frame.onload = function () { try { frame.contentWindow.postMessage({ t: "ping" }, "*"); } catch (e) {} };
      tplSelect.onchange = function () { load(tplSelect.value); };
      function load(file) {
        state.schema = state.cards = null;
        var p = document.querySelector(".ed-panel"); if (p) p.remove();
        frame.src = file;
      }
      load(H.templates[0].file);
      return;
    }

    // ① 직접 열기: 이 페이지에 패널 부착
    if (hasTpl) {
      document.body.classList.add("ed-on");
      buildEditor({
        schema: function () { return window.EDITOR_SCHEMA; },
        cards: function () { return window.CARDS; },
        render: function () { window.renderDeck(); },
        save: function (i) { window.saveCard && window.saveCard(i); },
        saveAll: function () { window.saveAll && window.saveAll(); },
        select: function (i, scroll) {
          var st = document.querySelectorAll("#deck .stage");
          st.forEach(function (s, k) { s.classList.toggle("ed-sel", k === i); });
          if (scroll && st[i]) st[i].scrollIntoView({ block: "center", behavior: "smooth" });
        },
      });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
