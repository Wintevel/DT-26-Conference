(function () {
  "use strict";

  var CATS = ["genre", "condition", "keyword"];
  var EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
  var EASE_IN_OUT = "cubic-bezier(0.77, 0, 0.175, 1)";

  // 카드 연출 타이밍 (ms). 무대용 연출이라 일반 UI보다 길게 잡았습니다.
  var DEAL = 520;      // 카드가 들어오는 시간
  var FLIP = 720;      // 카드가 뒤집히는 시간
  var FLIP_AT = 380;   // 들어오기 시작한 뒤 뒤집기 시작까지
  var GAP = 900;       // 다음 카드가 들어오기까지의 간격
  var EXIT = 280;      // 다시 뽑을 때 카드가 빠지는 시간

  var lists = window.DRAW_DEFAULTS;
  var intro = document.getElementById("intro");
  var deck = document.getElementById("deck");
  var btn = document.getElementById("draw");
  var cards = CATS.map(function (c) { return deck.querySelector('.card[data-cat="' + c + '"]'); });
  var mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  var busy = false;
  var last = {};
  var pending = null;   // 아직 조에 배정하지 않은 이번 결과

  function randInt(n) {
    if (window.crypto && window.crypto.getRandomValues) {
      var buf = new Uint32Array(1);
      var limit = Math.floor(0x100000000 / n) * n;
      do { window.crypto.getRandomValues(buf); } while (buf[0] >= limit);
      return buf[0] % n;
    }
    return Math.floor(Math.random() * n);
  }

  // 바로 직전 결과와 같은 항목은 가능하면 피합니다.
  function pick(cat) {
    var list = lists[cat];
    if (list.length < 2) return list[0] || "";
    var v;
    do { v = list[randInt(list.length)]; } while (v === last[cat]);
    last[cat] = v;
    return v;
  }

  function finished(anim) {
    return anim && anim.finished ? anim.finished : Promise.resolve();
  }

  // 최종 상태를 먼저 적어 두고, 시작 상태에서 그쪽으로 재생합니다 (fill: backwards).
  function play(el, frames, opts) {
    var end = frames[frames.length - 1];
    Object.keys(end).forEach(function (k) { if (k !== "offset") el.style[k] = end[k]; });
    if (!el.animate) return Promise.resolve();
    opts.fill = "backwards";
    return finished(el.animate(frames, opts));
  }

  function hideIntro() {
    var reduce = mq.matches;
    return play(intro, [
      { opacity: 1, transform: "translateY(0)" },
      { opacity: 0, transform: reduce ? "translateY(0)" : "translateY(-16px)" }
    ], { duration: reduce ? 200 : 320, easing: EASE_OUT }).then(function () {
      intro.hidden = true;
    });
  }

  function clearCards() {
    var reduce = mq.matches;
    return Promise.all(cards.map(function (card, i) {
      return play(card, [
        { opacity: 1, transform: "translateY(0)" },
        { opacity: 0, transform: reduce ? "translateY(0)" : "translateY(24px)" }
      ], { duration: reduce ? 160 : EXIT, delay: reduce ? 0 : (cards.length - 1 - i) * 50, easing: EASE_OUT });
    }));
  }

  function dealCards() {
    var reduce = mq.matches;
    deck.hidden = false;
    return Promise.all(cards.map(function (card, i) {
      var inner = card.querySelector(".inner");
      if (reduce) {
        inner.style.transform = "rotateY(0deg)";
        return play(card, [
          { opacity: 0, transform: "none" },
          { opacity: 1, transform: "none" }
        ], { duration: 220, delay: i * 260, easing: "ease" });
      }
      var t = i * GAP;
      var tilt = [-4, 2, 4][i];
      return Promise.all([
        play(card, [
          { opacity: 0, transform: "translateY(48px) scale(0.94) rotate(" + tilt + "deg)" },
          { opacity: 1, transform: "translateY(0) scale(1) rotate(0deg)" }
        ], { duration: DEAL, delay: t, easing: EASE_OUT }),
        play(inner, [
          { transform: "rotateY(180deg)" },
          { transform: "rotateY(0deg)" }
        ], { duration: FLIP, delay: t + FLIP_AT, easing: EASE_IN_OUT })
      ]);
    }));
  }

  function draw() {
    if (busy) return;
    busy = true;
    btn.disabled = true;

    var leave = deck.hidden ? hideIntro() : clearCards();
    var result = {};
    pending = null;
    renderTeams();
    leave.then(function () {
      cards.forEach(function (card, i) {
        var text = pick(CATS[i]);
        result[CATS[i]] = text;
        var desc = card.querySelector(".desc");
        var cut = text.indexOf(":");
        card.querySelector(".value").textContent = desc && cut > -1 ? text.slice(0, cut).trim() : text;
        if (desc) desc.textContent = cut > -1 ? text.slice(cut + 1).trim() : "";
      });
      return dealCards();
    }).then(function () {
      pending = result;
      renderTeams();
      btn.disabled = false;
      busy = false;
    });
  }

  btn.addEventListener("click", draw);

  // ---------- 전체 목록 팝업 ----------
  var dlg = document.getElementById("list");
  var listBtn = document.getElementById("listBtn");

  CATS.forEach(function (cat) {
    var ol = document.getElementById("list-" + cat);
    lists[cat].forEach(function (text) {
      var li = document.createElement("li");
      var body = document.createElement("span");
      var cut = cat === "condition" ? text.indexOf(":") : -1;
      body.textContent = cut > -1 ? text.slice(0, cut).trim() : text;
      if (cut > -1) {
        var small = document.createElement("small");
        small.textContent = text.slice(cut + 1).trim();
        body.appendChild(small);
      }
      li.appendChild(body);
      ol.appendChild(li);
    });
  });

  function openList() {
    if (dlg.open) return;
    dlg.showModal();
    if (!dlg.animate) return;
    var reduce = mq.matches;
    dlg.animate([
      { opacity: 0, transform: reduce ? "none" : "scale(0.96)" },
      { opacity: 1, transform: "none" }
    ], { duration: 220, easing: EASE_OUT });
  }

  var closing = false;
  function closeList() {
    if (!dlg.open || closing) return;
    if (!dlg.animate) { dlg.close(); return; }
    closing = true;
    var reduce = mq.matches;
    finished(dlg.animate([
      { opacity: 1, transform: "none" },
      { opacity: 0, transform: reduce ? "none" : "scale(0.96)" }
    ], { duration: 160, easing: EASE_OUT, fill: "forwards" })).then(function (a) {
      dlg.close();
      dlg.getAnimations().forEach(function (an) { an.cancel(); });
      closing = false;
    });
  }

  listBtn.addEventListener("click", openList);
  document.getElementById("listClose").addEventListener("click", closeList);
  dlg.addEventListener("cancel", function (e) { e.preventDefault(); closeList(); });
  dlg.addEventListener("click", function (e) { if (e.target === dlg) closeList(); });

  // ---------- 조 배정 ----------
  var TEAM_COUNT = 13;
  var KEY = "dt26-team-results";
  var teamBtn = document.getElementById("teamBtn");
  var teamPanel = document.getElementById("teamPanel");
  var teamHint = document.getElementById("teamHint");
  var resultsDlg = document.getElementById("results");
  var teams = {};
  try { teams = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { teams = {}; }

  function saveTeams() {
    try { localStorage.setItem(KEY, JSON.stringify(teams)); } catch (e) { /* 저장 불가 환경 */ }
  }
  function doneCount() {
    var n = 0;
    for (var i = 1; i <= TEAM_COUNT; i++) if (teams[i]) n++;
    return n;
  }
  function allDone() { return doneCount() === TEAM_COUNT; }

  var teamButtons = [];
  for (var t = 1; t <= TEAM_COUNT; t++) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "team";
    b.textContent = t;
    b.dataset.team = t;
    b.setAttribute("aria-label", t + "조에 이번 결과 배정");
    teamPanel.insertBefore(b, teamHint);
    teamButtons.push(b);
  }

  function renderTeams() {
    teamButtons.forEach(function (b) {
      var done = !!teams[b.dataset.team];
      b.classList.toggle("done", done);
      b.disabled = done || !pending;
    });
    teamHint.textContent = pending ? "조를 고르세요" : "DRAW 후 선택";
    var finished = allDone();
    teamBtn.classList.toggle("complete", finished);
    teamBtn.setAttribute("aria-label", finished ? "전체 조 결과 보기" : "조 선택 열기 (" + doneCount() + "/" + TEAM_COUNT + ")");
    if (finished) setPanel(false);
  }

  function setPanel(open) {
    teamPanel.classList.toggle("open", open);
    teamPanel.setAttribute("aria-hidden", String(!open));
    teamPanel.inert = !open;
    teamBtn.setAttribute("aria-expanded", String(open));
  }
  setPanel(false);

  teamBtn.addEventListener("click", function () {
    if (allDone()) { openResults(); return; }
    setPanel(!teamPanel.classList.contains("open"));
  });
  teamPanel.addEventListener("click", function (e) {
    var b = e.target.closest(".team");
    if (!b || b.disabled || !pending) return;
    teams[b.dataset.team] = pending;
    pending = null;
    saveTeams();
    renderTeams();
    setTimeout(function () { setPanel(false); }, 260);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && teamPanel.classList.contains("open")) setPanel(false);
  });
  document.addEventListener("click", function (e) {
    if (!teamPanel.classList.contains("open")) return;
    if (teamPanel.contains(e.target) || teamBtn.contains(e.target)) return;
    setPanel(false);
  });

  function split(text) {
    var cut = text.indexOf(":");
    return cut > -1 ? [text.slice(0, cut).trim(), text.slice(cut + 1).trim()] : [text, ""];
  }

  function openResults() {
    var tbody = document.getElementById("resultsBody");
    tbody.textContent = "";
    for (var i = 1; i <= TEAM_COUNT; i++) {
      var r = teams[i];
      var tr = document.createElement("tr");
      var cells = [i + "조", r ? r.genre : "-", null, r ? r.keyword : "-"];
      cells.forEach(function (c, k) {
        var td = document.createElement(k === 0 ? "th" : "td");
        if (k === 2) {
          var parts = r ? split(r.condition) : ["-", ""];
          td.textContent = parts[0];
          if (parts[1]) { var sm = document.createElement("small"); sm.textContent = parts[1]; td.appendChild(sm); }
        } else td.textContent = c;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
    resultsDlg.showModal();
    if (resultsDlg.animate) {
      resultsDlg.animate([
        { opacity: 0, transform: mq.matches ? "none" : "scale(0.96)" },
        { opacity: 1, transform: "none" }
      ], { duration: 220, easing: EASE_OUT });
    }
  }
  function closeResults() {
    if (!resultsDlg.open) return;
    if (!resultsDlg.animate) { resultsDlg.close(); return; }
    finished(resultsDlg.animate([
      { opacity: 1, transform: "none" },
      { opacity: 0, transform: mq.matches ? "none" : "scale(0.96)" }
    ], { duration: 160, easing: EASE_OUT, fill: "forwards" })).then(function () {
      resultsDlg.close();
      resultsDlg.getAnimations().forEach(function (an) { an.cancel(); });
    });
  }
  document.getElementById("resultsClose").addEventListener("click", closeResults);
  resultsDlg.addEventListener("cancel", function (e) { e.preventDefault(); closeResults(); });
  resultsDlg.addEventListener("click", function (e) { if (e.target === resultsDlg) closeResults(); });

  var resetBtn = document.getElementById("resultsReset");
  resetBtn.addEventListener("click", function () {
    if (resetBtn.dataset.armed !== "1") {
      resetBtn.dataset.armed = "1";
      resetBtn.textContent = "한 번 더 누르면 초기화";
      setTimeout(function () { resetBtn.dataset.armed = ""; resetBtn.textContent = "기록 초기화"; }, 3000);
      return;
    }
    teams = {};
    saveTeams();
    resetBtn.dataset.armed = ""; resetBtn.textContent = "기록 초기화";
    closeResults();
    renderTeams();
  });

  renderTeams();
})();
