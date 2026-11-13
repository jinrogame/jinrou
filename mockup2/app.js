(() => {
  "use strict";

  /* ============ データ ============ */
  const PLAYERS = [
    { n: "たろう", role: "人狼神", team: "w", alive: true },
    { n: "はなこ", role: "人狼", team: "w", alive: true },
    { n: "じろう", role: "サイコキラー", team: "w", alive: true },
    { n: "さぶろう", role: "占い師", team: "c", alive: true },
    { n: "しろう", role: "騎士", team: "c", alive: true },
    { n: "ごろう", role: "市民", team: "c", alive: true },
    { n: "ろくろう", role: "霊媒師", team: "c", alive: false },
    { n: "ななこ", role: "恋人", team: "c", alive: true },
    { n: "はちろう", role: "恋人", team: "c", alive: false },
    { n: "きゅうた", role: "奇跡の医者", team: "c", alive: true },
  ];
  const ME = 0;
  let customSelfieUrl = "";
  const av = (i) => (i === ME && customSelfieUrl ? customSelfieUrl : `img/avatar_${String(i + 1).padStart(2, "0")}.svg`);
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const ROLES = [
    { key: "wolf_god", name: "人狼神", team: "w", img: "img/role_wolf_god.svg", desc: "全員の役職が最初からわかる。夜に市民を襲撃する。", extra: `<div class="muted" style="font-size:11px;color:#fda4af">👁️ 全役職：はなこ(人狼)・じろう(サイコ)・さぶろう(占)・しろう(騎)・ろくろう(霊)・ななこ&はちろう(恋)・きゅうた(医)</div>` },
    { key: "werewolf", name: "人狼", team: "w", img: "img/role_werewolf.svg", desc: "人狼同士は互いがわかる。協力して夜に市民を襲撃する。", extra: `<div class="muted" style="font-size:11px;color:#fda4af">🐺 仲間：たろう（人狼神）</div>` },
    { key: "madman", name: "狂人", team: "w", img: "img/role_madman.svg", desc: "人狼の味方をする人間。占い結果は「人間」と出る。", extra: "" },
    { key: "psycho", name: "サイコキラー", team: "w", img: "img/role_psycho.svg", desc: "夜に自分へ関わったプレイヤーを全員返り討ちにする。", extra: "" },
    { key: "citizen", name: "市民", team: "c", img: "img/role_citizen.svg", desc: "特殊能力なし。議論・タスク貢献度・投票で人狼を追放しよう。", extra: "" },
    { key: "seer", name: "占い師", team: "c", img: "img/role_seer.svg", desc: "毎夜1人を占い「人狼」か「人間」かその場ですぐ知る。", extra: "" },
    { key: "medium", name: "霊媒師", team: "c", img: "img/role_medium.svg", desc: "追放された人が「人狼」だったかその場ですぐ知る。", extra: "" },
    { key: "knight", name: "騎士", team: "c", img: "img/role_knight.svg", desc: "毎夜1人を人狼の襲撃から守る。", extra: "" },
    { key: "lovers", name: "恋人", team: "c", img: "img/role_lovers.svg", desc: "2人1セット。片方が死ぬともう片方も後追いする。", extra: `<div class="muted" style="font-size:11px;color:#f9a8d4">💕 相方：ななこ さん</div>` },
    { key: "cosplayer", name: "コスプレイヤー", team: "c", img: "img/role_cosplayer.svg", desc: "毎夜1人を護衛できるが、占われると「人狼」と判定される。", extra: "" },
    { key: "doctor", name: "奇跡の医者", team: "c", img: "img/role_doctor.svg", desc: "ゲーム中1回だけ死者を蘇生（サイコキラーなら自分が死ぬ）。", extra: "" },
  ];

  const TASKS = [
    { key: "mash", name: "みんなで連打！", rule: "1分間で「生存人数×100回」を連打しよう", img: "img/task_mash.svg" },
    { key: "match", name: "気持ちを合わせろクイズ！", rule: "お題に全員が同じ回答を揃えよう", img: "img/task_match_quiz.svg" },
    { key: "unique", name: "かぶっちゃだめよクイズ！", rule: "お題に全員バラバラの回答をしよう", img: "img/task_unique_quiz.svg" },
    { key: "relay", name: "みんな答えろクイズ！", rule: "1分以内に順番にかぶらず回答しよう", img: "img/task_relay_quiz.svg" },
    { key: "timer", name: "10秒チャレンジ！", rule: "体内時計で10.0秒（±0.5秒）を狙おう", img: "img/task_timer10.svg" },
  ];

  const EFFECTS = [
    { type: "good", short: "全員ナイト", name: "今晩、市民全員がナイト（護衛）スキルを使用可能！", note: "※成功で発動 / 失敗時は効果なし", img: "img/effect_all_knight.svg" },
    { type: "good", short: "全員占い", name: "今晩、全員が占い師能力を1度だけ使える！", note: "※成功で発動 / 失敗時は効果なし", img: "img/effect_all_seer.svg" },
    { type: "good", short: "脱落者復活", name: "夜に脱落者を1人、投票で復活できる！", note: "※成功で発動（人狼が復活する可能性あり）", img: "img/effect_revive.svg" },
    { type: "good", short: "夜襲封じ", name: "今晩、人狼の夜襲が封じられる！", note: "※成功で発動 / 失敗時は効果なし", img: "img/effect_no_attack.svg" },
    { type: "good", short: "人狼数公開", name: "生存している人狼陣営の残り人数が公開される！", note: "※成功で発動 / 失敗時は効果なし", img: "img/effect_wolf_count.svg" },
    { type: "bad", short: "夜襲+1", name: "失敗すると今晩の夜襲対象が＋1人増える…！", note: "※失敗で罰発生 / 成功で回避", img: "img/penalty_extra_attack.svg" },
    { type: "bad", short: "占い無効", name: "失敗すると今晩、占い師のスキルが無効に…！", note: "※失敗で罰発生 / 成功で回避", img: "img/penalty_seer_off.svg" },
    { type: "bad", short: "2人追放", name: "失敗すると今晩の追放投票で上位2人が追放…！", note: "※失敗で罰発生 / 成功で回避", img: "img/penalty_double_exile.svg" },
  ];

  const CONTRIB = [
    { i: 0, v: "118回 / 10.04秒", pct: 100, ok: true, mvp: true },
    { i: 1, v: "105回 / 9.85秒", pct: 89, ok: true },
    { i: 2, v: "92回 / 10.22秒", pct: 78, ok: true },
    { i: 3, v: "76回 / 8.10秒", pct: 64, ok: false },
    { i: 4, v: "101回 / 9.71秒", pct: 86, ok: true },
    { i: 5, v: "88回 / 10.31秒", pct: 75, ok: true },
    { i: 7, v: "64回 / 11.40秒", pct: 54, ok: false, low: true },
    { i: 9, v: "99回 / 10.02秒", pct: 84, ok: true },
  ];

  const CITIZEN_ROLES = [
    { n: "占い師", e: "🔮", slots: 1, on: true },
    { n: "霊媒師", e: "🕯️", slots: 1, on: true },
    { n: "騎士", e: "🛡️", slots: 1, on: true },
    { n: "恋人", e: "💕", slots: 2, on: true, sub: "2人組" },
    { n: "コスプレ", e: "🎭", slots: 1, on: false, sub: "占い黒" },
    { n: "奇跡の医者", e: "💉", slots: 1, on: true, sub: "1回蘇生" },
  ];

  const WOLF_ROLES = [
    { id: "god", n: "人狼神", e: "👁️", v: 1 },
    { id: "wolf", n: "人狼", e: "🐺", v: 1 },
    { id: "mad", n: "狂人", e: "🃏", v: 0 },
    { id: "psy", n: "サイコ", e: "🔪", v: 1 },
  ];

  /* ============ 描画ヘルパ ============ */
  const img = (i, cls = "avatar") => `<img class="${cls}" src="${av(i)}" alt="" width="38" height="38" loading="lazy">`;

  const renderers = {
    avatars(el) {
      const mode = el.dataset.mode;
      el.innerHTML = PLAYERS.map((p, i) => {
        let c = "av";
        if (mode === "lobby") c += i === ME ? " is-owner is-me" : "";
        if (mode === "lobby-member") c += (i === 0 ? " is-owner" : "") + (i === 1 ? " is-me" : " is-ready");
        if (mode === "status" && !p.alive) c += " is-dead";
        return `<div class="${c}">${img(i)}<span>${p.n}</span></div>`;
      }).join("");
    },
    order(el) {
      el.innerHTML = PLAYERS.map((p, i) => `<span class="step">${img(i, "avatar avatar--sm")}${i + 1}.${p.n}</span>`).join("");
    },
    picks(el) {
      const name = el.dataset.name, filter = el.dataset.filter, checked = Number(el.dataset.checked || 0), sub = el.dataset.sub;
      let list = PLAYERS.map((p, i) => ({ ...p, i }));
      if (filter === "others") list = list.filter((p) => p.i !== ME);
      if (filter === "alive-others") list = list.filter((p) => p.alive && p.i !== ME);
      if (filter === "dead") list = list.filter((p) => !p.alive);
      if (filter === "citizens") list = list.filter((p) => p.alive && p.team === "c");
      el.innerHTML = list.map((p, idx) => `
        <label class="pick${p.alive ? "" : " is-dead"}">
          <input type="radio" name="${name}" value="${p.i}"${idx === checked ? " checked" : ""}>
          <span class="radio" aria-hidden="true"></span>
          ${img(p.i)}
          <span class="pick__name">${p.n}${sub === "wolf" && idx === 1 ? " 🐺2票" : ""}</span>
        </label>`).join("");
    },
    contrib(el) {
      el.innerHTML = CONTRIB.map((c) => `
        <div class="contrib__row${c.mvp ? " is-mvp" : ""}${c.low ? " is-low" : ""}">
          ${img(c.i)}<b>${PLAYERS[c.i].n}${c.mvp ? "🏅" : ""}</b>
          <span class="val ${c.ok ? "ok" : "ng"}">${c.v}</span>
          <div class="bar"><i style="--w:${c.pct}%"></i></div>
        </div>`).join("");
    },
    roletable(el) {
      el.innerHTML = PLAYERS.map((p, i) => `
        <div class="role-cell">
          ${img(i, "avatar avatar--sm")}
          <span class="who">${p.n}</span>
          <span class="${p.team === "w" ? "tag-w" : "tag-c"}">${p.role}</span>
        </div>`).join("");
    },
    wolfsteppers(el) {
      el.innerHTML = WOLF_ROLES.map((r) => `
        <div class="switch" style="cursor:default"><span class="nm">${r.e} ${r.n}</span>
          <span class="stepper"><button type="button" data-wolf="${r.id}" data-d="-1" aria-label="${r.n}を減らす">−</button><b id="wc-${r.id}">${r.v}</b><button type="button" data-wolf="${r.id}" data-d="1" aria-label="${r.n}を増やす">＋</button></span></div>`).join("");
    },
    citizenswitches(el) {
      el.innerHTML = CITIZEN_ROLES.map((r) => `
        <label class="switch"><span class="nm">${r.e} ${r.n}${r.sub ? `<small>${r.sub}</small>` : ""}</span>
          <input type="checkbox" data-slots="${r.slots}"${r.on ? " checked" : ""} aria-label="${r.n}"></label>`).join("");
    },
  };

  function renderAllDynamic() {
    $$("[data-render]").forEach((el) => renderers[el.dataset.render]?.(el));
  }
  renderAllDynamic();

  /* ============ 01 顔アイコン撮影（カメラ起動 / 写真選択）＆名前連動 ============ */
  const selfiePreview = $("#selfiePreview");
  const selfieVideo = $("#selfieVideo");
  const btnCameraToggle = $("#btnCameraToggle");
  const selfieFileInput = $("#selfieFileInput");
  const nameInput = $("#name");
  let activeStream = null;

  function stopCameraStream() {
    if (activeStream) {
      activeStream.getTracks().forEach((t) => t.stop());
      activeStream = null;
    }
    if (selfieVideo) {
      selfieVideo.srcObject = null;
      selfieVideo.hidden = true;
    }
    if (selfiePreview) selfiePreview.hidden = false;
    if (btnCameraToggle) btnCameraToggle.textContent = "📷 カメラを起動して顔を撮影";
  }

  function applySelfieFromSource(sourceEl, srcW, srcH, mirrorHorizontal = false) {
    const size = 144;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const minSide = Math.min(srcW, srcH);
    const sx = (srcW - minSide) / 2;
    const sy = (srcH - minSide) / 2;
    if (mirrorHorizontal) {
      ctx.translate(size, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(sourceEl, sx, sy, minSide, minSide, 0, 0, size, size);
    customSelfieUrl = canvas.toDataURL("image/webp", 0.8);
    if (selfiePreview) selfiePreview.src = customSelfieUrl;
    renderAllDynamic();
  }

  if (btnCameraToggle) {
    btnCameraToggle.addEventListener("click", async () => {
      if (activeStream && selfieVideo && !selfieVideo.hidden) {
        applySelfieFromSource(selfieVideo, selfieVideo.videoWidth || 144, selfieVideo.videoHeight || 144, true);
        stopCameraStream();
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        selfieFileInput?.click();
        return;
      }
      try {
        activeStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 256 }, height: { ideal: 256 } },
          audio: false,
        });
        if (selfieVideo && selfiePreview) {
          selfieVideo.srcObject = activeStream;
          selfiePreview.hidden = true;
          selfieVideo.hidden = false;
          await selfieVideo.play();
          btnCameraToggle.textContent = "📸 パシャ！撮影して決定";
        }
      } catch {
        selfieFileInput?.click();
      }
    });
  }

  if (selfieFileInput) {
    selfieFileInput.addEventListener("change", () => {
      const file = selfieFileInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        const tempImg = new Image();
        tempImg.addEventListener("load", () => {
          applySelfieFromSource(tempImg, tempImg.naturalWidth || 144, tempImg.naturalHeight || 144, false);
          stopCameraStream();
        });
        tempImg.src = String(reader.result);
      });
      reader.readAsDataURL(file);
    });
  }

  if (nameInput) {
    nameInput.addEventListener("input", () => {
      PLAYERS[ME].n = nameInput.value.trim() || "たろう";
      renderAllDynamic();
    });
  }

  /* ============ 画面遷移 ＆ 上部サブバー（スマホ枠外でのパターン切替） ============ */
  const ORDER = ["s01", "s02", "s03", "s04", "s05", "s06", "s07", "s08", "s09", "s10", "s11", "s12a", "s12b", "s13", "s14"];
  const jump = $("#jump");
  const subBar = $("#subBar");
  let current = "s01";
  const timers = new Map();

  function buildSubBar(id) {
    if (!subBar) return;
    subBar.innerHTML = "";
    subBar.hidden = true;
    const addChips = (items, onSelect) => {
      subBar.hidden = false;
      items.forEach((item, idx) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "chip-btn" + (idx === 0 ? " is-selected" : "");
        b.textContent = item.label;
        b.addEventListener("click", () => {
          $$(".chip-btn", subBar).forEach((x) => x.classList.toggle("is-selected", x === b));
          onSelect(item, idx);
        });
        subBar.appendChild(b);
      });
    };

    if (id === "s04") {
      addChips(ROLES.map((r) => ({ label: r.name })), (_, idx) => {
        setRole(idx);
        revealRole();
      });
    } else if (id === "s06") {
      addChips([{ label: "🔮 占い師画面", v: "fn-seer" }, { label: "🏠 その他役職", v: "fn-other" }], (item) => {
        $$("[data-variant]", $("#s06")).forEach((el) => { el.hidden = el.dataset.variant !== item.v; });
      });
    } else if (id === "s08") {
      addChips(EFFECTS.map((e, i) => ({ label: `${e.type === "good" ? "✨" : "💀"}${e.short}`, i })), (item) => {
        setEffect(item.i);
        setTask(item.i % TASKS.length);
      });
    } else if (id === "s09") {
      addChips([
        { label: "① 連打", v: "mg1" },
        { label: "② 気持ち一致", v: "mg2" },
        { label: "③ かぶり禁止", v: "mg3" },
        { label: "④ 順番回答", v: "mg4" },
        { label: "⑤ 10秒", v: "mg5" },
      ], (item) => {
        $$("[data-variant]", $("#s09")).forEach((el) => { el.hidden = el.dataset.variant !== item.v; });
      });
    } else if (id === "s10") {
      addChips([{ label: "🎉 タスク成功", v: "r-ok" }, { label: "💥 タスク失敗", v: "r-ng" }], (item) => {
        $$("[data-variant]", $("#s10")).forEach((el) => { el.hidden = el.dataset.variant !== item.v; });
      });
    } else if (id === "s13") {
      addChips([
        { label: "占い・霊媒", v: "n-seer" },
        { label: "人狼の夜襲", v: "n-wolf" },
        { label: "騎士・医者", v: "n-knight" },
        { label: "市民OK", v: "n-citizen" },
        { label: "死亡者静観", v: "n-dead" },
      ], (item) => {
        $$("[data-variant]", $("#s13")).forEach((el) => { el.hidden = el.dataset.variant !== item.v; });
      });
    } else if (id === "s14") {
      addChips([
        { label: "🏆 市民勝利", k: "cit" },
        { label: "🐺 人狼勝利", k: "wol" },
        { label: "⚖️ 引き分け", k: "draw" },
      ], (item) => setEnding(item.k));
    }
  }

  function go(id) {
    if (!ORDER.includes(id)) return;
    if (id !== "s01") stopCameraStream();
    $$(".screen").forEach((s) => s.classList.toggle("is-active", s.id === id));
    current = id;
    jump.value = id;
    stopAllTimers();
    startTimers($("#" + id));
    if (id === "s04") resetFlip();
    if (id === "s09") resetStop();
    buildSubBar(id);
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-go]");
    if (t && !t.disabled) go(t.dataset.go);
  });
  jump.addEventListener("change", () => go(jump.value));
  $("#prev").addEventListener("click", () => go(ORDER[(ORDER.indexOf(current) + ORDER.length - 1) % ORDER.length]));
  $("#next").addEventListener("click", () => go(ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]));

  /* ============ 円形タイマー ============ */
  const fmt = (s, short) => (short ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`);
  function startTimers(scope) {
    $$("[data-countdown]", scope).forEach((el) => {
      let left = Number(el.dataset.countdown);
      const total = Number(el.dataset.total || left);
      const txt = $("[data-time]", el);
      const short = el.classList.contains("ring--sm");
      const draw = () => { el.style.setProperty("--p", (left / total) * 100); if (txt) txt.textContent = fmt(left, short); };
      draw();
      timers.set(el, setInterval(() => { left = left > 0 ? left - 1 : 0; draw(); }, 1000));
    });
  }
  function stopAllTimers() { timers.forEach((id) => clearInterval(id)); timers.clear(); }

  /* ============ 01 / 02 最大ターン数指定（デフォルト5）＆ ロビー配役計算 ============ */
  let maxTurns = 5;
  document.addEventListener("click", (e) => {
    const tb = e.target.closest("[data-max-turn]");
    if (!tb) return;
    maxTurns = Math.max(1, Math.min(10, maxTurns + Number(tb.dataset.maxTurn)));
    $$("[data-max-turn-val]").forEach((el) => { el.textContent = String(maxTurns); });
  });

  const wolfVals = Object.fromEntries(WOLF_ROLES.map((r) => [r.id, r.v]));
  function recalc() {
    const wolf = Object.values(wolfVals).reduce((a, b) => a + b, 0);
    const special = $$('[data-render="citizenswitches"] input:checked').reduce((a, c) => a + Number(c.dataset.slots), 0);
    const auto = 10 - wolf - special;
    $("#wolfTotal").textContent = wolf;
    $("#autoCitizen").textContent = `${Math.max(auto, 0)}人`;
    const bar = $("#totalBar");
    const total = wolf + special + Math.max(auto, 0);
    bar.classList.toggle("is-bad", auto < 0);
    $("#totalVal").textContent = auto < 0 ? `${wolf + special} / 10人（超過）` : `${total} / 10人`;
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-wolf]");
    if (!b) return;
    const id = b.dataset.wolf;
    wolfVals[id] = Math.max(0, Math.min(4, wolfVals[id] + Number(b.dataset.d)));
    $("#wc-" + id).textContent = wolfVals[id];
    recalc();
  });
  document.addEventListener("change", (e) => { if (e.target.matches('[data-render="citizenswitches"] input')) recalc(); });
  recalc();

  /* ============ 04 役職発表（カード反転） ============ */
  const flip = $("#flip"), roleOk = $("#roleOk");
  function setRole(i) {
    const r = ROLES[i];
    $("#roleImg").src = r.img;
    $("#roleName").textContent = r.name;
    $("#roleDesc").textContent = r.desc;
    $("#roleExtra").innerHTML = r.extra;
    const f = $("#roleFaction");
    f.textContent = r.team === "w" ? "人狼陣営" : "市民陣営";
    f.className = "chip " + (r.team === "w" ? "chip--red" : "chip--accent");
    $("#s04").style.setProperty("--accent", r.team === "w" ? "var(--red)" : "var(--cyan)");
  }
  function revealRole() {
    flip.classList.add("is-flipped");
    $("#roleInfo").hidden = false;
    $("#flipHint").hidden = true;
    roleOk.disabled = false;
  }
  function resetFlip() {
    flip.classList.remove("is-flipped");
    $("#roleInfo").hidden = true;
    $("#flipHint").hidden = false;
    roleOk.disabled = true;
  }
  flip.addEventListener("click", revealRole);
  setRole(0);

  /* ============ 08 タスク/効果切替 ============ */
  function setTask(idx) {
    const t = TASKS[idx];
    $("#taskArt").src = t.img;
    $("#taskName").textContent = t.name;
    $("#taskRule").textContent = t.rule;
  }
  function setEffect(idx) {
    const t = EFFECTS[idx];
    const good = t.type === "good";
    $("#effectArt").src = t.img;
    $("#effectName").textContent = t.name;
    $("#effectNote").textContent = t.note;
    const card = $("#effectCard");
    card.classList.toggle("card--green", good);
    card.classList.toggle("card--red", !good);
    const badge = $("#effectBadge");
    badge.textContent = good ? "成功報酬" : "失敗時の罰";
    badge.className = "chip " + (good ? "chip--green" : "chip--red");
  }

  /* ============ 09 ミニゲーム ============ */
  let mash = 780, mine = 98;
  const tap = $("#tapBtn");
  const doTap = () => {
    mash = Math.min(mash + 1, 1200);
    mine += 1;
    $("#mashTotal").textContent = mash;
    $("#mashMine").textContent = mine;
    $("#mashGauge").style.setProperty("--w", Math.min(100, Math.round((mash / 800) * 100)) + "%");
  };
  tap.addEventListener("pointerdown", () => { tap.classList.add("is-down"); doTap(); });
  ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => tap.addEventListener(ev, () => tap.classList.remove("is-down")));

  let stopT0 = 0, stopRaf = 0;
  const box = $("#stopBox"), tm = $("#stopTime"), hint = $("#stopHint"), startB = $("#stopStart"), stopB = $("#stopBtn");
  function resetStop() {
    cancelAnimationFrame(stopRaf);
    box.className = "stopbox";
    tm.textContent = "0.00";
    hint.textContent = "START後、3秒で数字が隠れます。";
    startB.disabled = false;
    stopB.disabled = true;
  }
  startB.addEventListener("click", () => {
    box.className = "stopbox";
    startB.disabled = true;
    stopB.disabled = false;
    stopT0 = performance.now();
    hint.textContent = "10.0秒だと思ったタイミングでSTOP！";
    const loop = () => {
      const s = (performance.now() - stopT0) / 1000;
      tm.textContent = s < 3 ? s.toFixed(2) : "??.??";
      stopRaf = requestAnimationFrame(loop);
    };
    loop();
  });
  stopB.addEventListener("click", () => {
    cancelAnimationFrame(stopRaf);
    const s = (performance.now() - stopT0) / 1000;
    const ok = Math.abs(s - 10) <= 0.5;
    tm.textContent = s.toFixed(2);
    box.className = "stopbox " + (ok ? "is-ok" : "is-ng");
    hint.textContent = ok ? "🎉 成功！（±0.5秒以内）" : "💥 失敗…（±0.5秒超過）";
    startB.disabled = false;
    stopB.disabled = true;
  });

  /* ============ 14 勝敗 ============ */
  const ENDS = {
    cit: { img: "img/victory_citizen.svg", title: "🏆 市民陣営 勝利！", c: 4, w: 0 },
    wol: { img: "img/victory_wolf.svg", title: "🐺 人狼陣営 勝利！", c: 0, w: 3 },
    draw: { img: "img/victory_draw.svg", title: "⚖️ 引き分け（同数）", c: 3, w: 3 },
  };
  function setEnding(key) {
    const d = ENDS[key];
    $("#endImg").src = d.img;
    $("#endTitle").textContent = d.title;
    $("#vsC").textContent = d.c + "人";
    $("#vsW").textContent = d.w + "人";
  }

  /* ============ スキル即時結果 ＆ 昼の情報モーダル ============ */
  const dlg = $("#resultDialog");
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-skill]");
    if (!b) return;
    if (b.dataset.skill === "seer") {
      const sel = document.querySelector(`input[name="${b.dataset.pick}"]:checked`);
      const p = PLAYERS[Number(sel?.value ?? 1)];
      const wolf = p.role === "人狼神" || p.role === "人狼";
      $("#resIco").textContent = "🔮";
      $("#resTitle").textContent = "占い結果（即時表示）";
      $("#resBody").innerHTML = `<em>${p.n}</em> は<br>【<span class="${wolf ? "wolf" : "human"}">${wolf ? "人狼" : "人間"}</span>】でした！`;
      $("#resNote").textContent = "※結果はその場ですぐ確認できます。";
    } else {
      $("#resIco").textContent = "🕯️";
      $("#resTitle").textContent = "霊媒結果（即時表示）";
      $("#resBody").innerHTML = `追放された <em>ろくろう</em> は<br>【<span class="human">人間</span>】でした！`;
      $("#resNote").textContent = "※直前の追放投票の結果です。";
    }
    dlg.returnValue = "";
    dlg.showModal();
  });

  const btnOpenDayInfo = $("#btnOpenDayInfo");
  if (btnOpenDayInfo) {
    btnOpenDayInfo.addEventListener("click", () => {
      $("#resIco").textContent = "📊";
      $("#resTitle").textContent = "今朝の貢献度・発生中の効果";
      $("#resBody").innerHTML = `<div style="font-size:13px;text-align:left;font-weight:700">✨ 発動中：今晩、市民全員がナイトスキル使用可能<br>🏅 MVP：${PLAYERS[0].n}（118回）<br>⚠️ 未達：さぶろう（76回）・ななこ（64回）</div>`;
      $("#resNote").textContent = "※画面をスクロールさせずにモーダルで確認できます。";
      dlg.returnValue = "";
      dlg.showModal();
    });
  }

  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
})();
