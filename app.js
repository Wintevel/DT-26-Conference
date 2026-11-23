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
    leave.then(function () {
      cards.forEach(function (card, i) {
        var text = pick(CATS[i]);
        var desc = card.querySelector(".desc");
        var cut = text.indexOf(":");
        card.querySelector(".value").textContent = desc && cut > -1 ? text.slice(0, cut).trim() : text;
        if (desc) desc.textContent = cut > -1 ? text.slice(cut + 1).trim() : "";
      });
      return dealCards();
    }).then(function () {
      btn.disabled = false;
      busy = false;
    });
  }

  btn.addEventListener("click", draw);
})();
