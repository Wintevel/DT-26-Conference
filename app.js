(function () {
  "use strict";

  var CATS = ["genre", "condition", "keyword"];
  var LABEL = { genre: "장르", condition: "특수조건", keyword: "키워드" };
  var TEAM_COUNT = 13;
  var KEY_LISTS = "dt26-draw-lists";
  var KEY_HISTORY = "dt26-draw-history";
  var KEY_PREFS = "dt26-draw-prefs";

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- storage (안전하게) ----------
  function load(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 저장 불가 환경 */ }
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function clean(list) {
    var seen = {};
    return (list || []).map(function (s) { return String(s).trim(); })
      .filter(function (s) { if (!s || seen[s]) return false; seen[s] = 1; return true; });
  }

  var lists = load(KEY_LISTS, null) || clone(window.DRAW_DEFAULTS);
  CATS.forEach(function (c) { lists[c] = clean(lists[c]); });
  var history = load(KEY_HISTORY, []);
  var prefs = load(KEY_PREFS, { kwCount: 2, noDupGenre: false, team: "" });

  var current = { genre: null, condition: null, keyword: null };
  var locked = { genre: false, condition: false, keyword: false };
  var busy = false;

  // ---------- DOM ----------
  var $ = function (s) { return document.querySelector(s); };
  var teamSel = $("#team");
  var kwSel = $("#kwCount");
  var noDup = $("#noDupGenre");
  var drawBtn = $("#drawBtn");
  var statusEl = $("#status");
  var historyList = $("#historyList");

  for (var i = 1; i <= TEAM_COUNT; i++) {
    var o = document.createElement("option");
    o.value = String(i);
    o.textContent = i + "조";
    teamSel.appendChild(o);
  }
  teamSel.value = prefs.team || "";
  kwSel.value = String(prefs.kwCount || 2);
  noDup.checked = !!prefs.noDupGenre;

  function savePrefs() {
    prefs = { kwCount: +kwSel.value, noDupGenre: noDup.checked, team: teamSel.value };
    save(KEY_PREFS, prefs);
  }
  [teamSel, kwSel, noDup].forEach(function (el) { el.addEventListener("change", savePrefs); });
  kwSel.addEventListener("change", function () {
    if (current.keyword && !locked.keyword && !busy) rollOne("keyword", true);
  });

  function slotResult(cat) { return document.querySelector('.slot[data-cat="' + cat + '"] .result'); }

  // ---------- random ----------
  function randInt(n) {
    if (window.crypto && window.crypto.getRandomValues) {
      var buf = new Uint32Array(1);
      var limit = Math.floor(0x100000000 / n) * n;
      do { window.crypto.getRandomValues(buf); } while (buf[0] >= limit);
      return buf[0] % n;
    }
    return Math.floor(Math.random() * n);
  }
  function sample(list, k) {
    var a = list.slice(), out = [];
    k = Math.min(k, a.length);
    for (var j = 0; j < k; j++) out.push(a.splice(randInt(a.length), 1)[0]);
    return out;
  }

  // 다른 조가 이미 뽑은 장르 (각 조의 가장 최근 기록 기준)
  function takenGenres(team) {
    var latest = {};
    history.forEach(function (h) { if (h.team && !(h.team in latest)) latest[h.team] = h.genre; });
    return Object.keys(latest).filter(function (t) { return t !== team; }).map(function (t) { return latest[t]; });
  }

  function pool(cat) {
    var list = lists[cat];
    if (cat === "genre" && noDup.checked) {
      var taken = takenGenres(teamSel.value);
      var left = list.filter(function (g) { return taken.indexOf(g) === -1; });
      if (left.length) return left;
      setStatus("남은 장르가 없어 겹치는 장르도 포함해서 뽑았습니다.");
    }
    return list;
  }

  function pick(cat) {
    var p = pool(cat);
    if (cat === "keyword") return sample(p, +kwSel.value);
    return sample(p, 1)[0];
  }

  // ---------- render ----------
  function renderValue(cat, value, spinning) {
    var el = slotResult(cat);
    el.classList.toggle("spinning", !!spinning);
    el.textContent = "";
    if (value == null) {
      var ph = document.createElement("span");
      ph.className = "placeholder"; ph.textContent = "?";
      el.appendChild(ph);
      return;
    }
    if (Array.isArray(value)) {
      var wrap = document.createElement("div");
      value.forEach(function (v) {
        var s = document.createElement("span");
        s.className = "kw"; s.textContent = v;
        wrap.appendChild(s);
      });
      el.appendChild(wrap);
    } else {
      el.textContent = value;
    }
  }

  function spin(cat, final, duration) {
    return new Promise(function (resolve) {
      var el = slotResult(cat);
      if (reduceMotion || duration <= 0) {
        renderValue(cat, final, false);
        resolve();
        return;
      }
      var list = lists[cat];
      var start = performance.now();
      var delay = 45;
      (function tick() {
        var t = performance.now() - start;
        if (t >= duration) {
          renderValue(cat, final, false);
          el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
          resolve();
          return;
        }
        var fake = cat === "keyword" ? sample(list, Array.isArray(final) ? final.length : 1) : list[randInt(list.length)];
        renderValue(cat, fake, true);
        delay = 45 + 180 * Math.pow(t / duration, 2.2);
        setTimeout(tick, delay);
      })();
    });
  }

  function setBusy(b) {
    busy = b;
    drawBtn.disabled = b;
    document.querySelectorAll(".mini").forEach(function (m) { m.disabled = b; });
  }
  function setStatus(msg) { statusEl.textContent = msg || ""; }

  function emptyCheck(cats) {
    var empty = cats.filter(function (c) { return !lists[c].length; });
    if (empty.length) {
      setStatus(empty.map(function (c) { return LABEL[c]; }).join(", ") + " 목록이 비어 있습니다. 목록 편집에서 항목을 추가해 주세요.");
      return false;
    }
    return true;
  }

  // ---------- draw ----------
  function drawAll() {
    if (busy) return;
    var cats = CATS.filter(function (c) { return !locked[c]; });
    if (!cats.length) { setStatus("세 항목이 모두 고정되어 있습니다."); return; }
    if (!emptyCheck(cats)) return;
    setStatus("");
    setBusy(true);
    var jobs = cats.map(function (c, idx) {
      var v = pick(c);
      current[c] = v;
      return spin(c, v, 900 + idx * 450);
    });
    Promise.all(jobs).then(function () {
      setBusy(false);
      record();
    });
  }

  function rollOne(cat, quick) {
    if (busy || locked[cat]) return;
    if (!emptyCheck([cat])) return;
    setStatus("");
    setBusy(true);
    var v = pick(cat);
    current[cat] = v;
    spin(cat, v, quick ? 500 : 900).then(function () {
      setBusy(false);
      record();
    });
  }

  function record() {
    var team = teamSel.value;
    if (!current.genre || !current.condition || !current.keyword) return;
    var entry = {
      team: team,
      genre: current.genre,
      condition: current.condition,
      keyword: current.keyword.slice(),
      at: Date.now()
    };
    if (!team) {
      setStatus("조를 선택하면 결과가 기록에 남습니다.");
      return;
    }
    history.unshift(entry);
    if (history.length > 200) history.length = 200;
    save(KEY_HISTORY, history);
    renderHistory();
    setStatus(team + "조 결과를 기록했습니다.");
  }

  // ---------- history ----------
  function fmtTime(ms) {
    var d = new Date(ms);
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return (d.getMonth() + 1) + "/" + d.getDate() + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  function line(h) {
    return h.team + "조 | 장르: " + h.genre + " | 특수조건: " + h.condition + " | 키워드: " + h.keyword.join(", ");
  }

  function renderHistory() {
    historyList.textContent = "";
    if (!history.length) {
      var li = document.createElement("li");
      li.innerHTML = '<span class="empty">아직 기록이 없습니다.</span>';
      li.style.display = "block";
      historyList.appendChild(li);
      return;
    }
    history.forEach(function (h, idx) {
      var li = document.createElement("li");
      var team = document.createElement("span");
      team.className = "team"; team.textContent = h.team + "조";
      var body = document.createElement("span");
      body.className = "body";
      [["genre", h.genre], ["condition", h.condition], ["keyword", h.keyword.join(", ")]].forEach(function (pair, k) {
        if (k) { var sep = document.createElement("span"); sep.className = "sep"; sep.textContent = "/"; body.appendChild(sep); }
        var b = document.createElement("b"); b.textContent = pair[1];
        body.appendChild(b);
      });
      var meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = fmtTime(h.at);
      var del = document.createElement("button");
      del.type = "button"; del.className = "del"; del.textContent = "×";
      del.setAttribute("aria-label", h.team + "조 기록 삭제");
      del.addEventListener("click", function () {
        history.splice(idx, 1);
        save(KEY_HISTORY, history);
        renderHistory();
      });
      meta.appendChild(del);
      li.appendChild(team); li.appendChild(body); li.appendChild(meta);
      historyList.appendChild(li);
    });
  }

  $("#clearBtn").addEventListener("click", function () {
    if (!history.length) return;
    var btn = this;
    if (btn.dataset.confirm !== "1") {
      btn.dataset.confirm = "1";
      btn.textContent = "한 번 더 누르면 삭제";
      setTimeout(function () { btn.dataset.confirm = ""; btn.textContent = "기록 지우기"; }, 3000);
      return;
    }
    history = [];
    save(KEY_HISTORY, history);
    renderHistory();
    btn.dataset.confirm = ""; btn.textContent = "기록 지우기";
    setStatus("기록을 지웠습니다.");
  });

  $("#copyBtn").addEventListener("click", function () {
    if (!history.length) { setStatus("복사할 기록이 없습니다."); return; }
    var text = history.slice().sort(function (a, b) { return a.team - b.team || a.at - b.at; }).map(line).join("\n");
    var done = function () { setStatus("기록을 클립보드에 복사했습니다."); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else { fallbackCopy(text); done(); }
  });
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (e) { /* noop */ }
    ta.remove();
  }

  // ---------- buttons ----------
  drawBtn.addEventListener("click", drawAll);
  document.querySelectorAll(".reroll").forEach(function (b) {
    b.addEventListener("click", function () { rollOne(b.dataset.cat); });
  });
  document.querySelectorAll(".lock").forEach(function (b) {
    b.addEventListener("click", function () {
      var c = b.dataset.cat;
      if (!locked[c] && current[c] == null) { setStatus("먼저 뽑은 뒤에 고정할 수 있습니다."); return; }
      locked[c] = !locked[c];
      b.setAttribute("aria-pressed", String(locked[c]));
      b.textContent = locked[c] ? "고정됨" : "고정";
      b.closest(".slot").classList.toggle("locked", locked[c]);
      document.querySelector('.reroll[data-cat="' + c + '"]').disabled = locked[c];
    });
  });
  document.addEventListener("keydown", function (e) {
    if (e.code === "Space" && !e.repeat && document.activeElement === document.body && !$("#editor").open) {
      e.preventDefault(); drawAll();
    }
  });

  // ---------- editor ----------
  var editor = $("#editor");
  function fillEditor(src) {
    CATS.forEach(function (c) {
      $("#ed-" + c).value = src[c].join("\n");
      updateCount(c);
    });
  }
  function updateCount(c) {
    $("#cnt-" + c).textContent = "(" + clean($("#ed-" + c).value.split("\n")).length + "개)";
  }
  CATS.forEach(function (c) { $("#ed-" + c).addEventListener("input", function () { updateCount(c); }); });

  $("#editBtn").addEventListener("click", function () {
    fillEditor(lists);
    if (editor.showModal) editor.showModal(); else editor.setAttribute("open", "");
  });
  $("#saveLists").addEventListener("click", function () {
    CATS.forEach(function (c) { lists[c] = clean($("#ed-" + c).value.split("\n")); });
    save(KEY_LISTS, lists);
    editor.close();
    setStatus("목록을 저장했습니다.");
  });
  $("#resetLists").addEventListener("click", function () {
    fillEditor(window.DRAW_DEFAULTS);
  });

  renderHistory();
})();
