// 画面描画（フェーズごとに画面を1回だけ構築し、スナップショットのたびに update() で差分反映）
import { S, isHost, me, playerList, aliveList, nameOf, avatarOf, sortedPlayers } from "./state.js";
import { ROLES, WOLF_CONFIG, CITIZEN_CONFIG, TASKS, EFFECTS, TIME, MAX_PLAYERS } from "./data.js";
import { roleCounts, capabilities, isWolfTeam, checkWin } from "./engine.js";
import * as Host from "./host.js";
import * as Room from "./room.js";
import * as fb from "./firebase.js";
import { playMorningCutscene, playDayCutscene, playNightCutscene, clearCutscene } from "./cutscenes.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const phone = $("#phone");
const dlg = $("#resultDialog");
const leaveDlg = $("#leaveDialog");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
const fmtS = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

let root = null, lastKey = null, ctx = {}, cleanups = [];
export const addCleanup = (f) => cleanups.push(f);
export const profile = { name: localStorage.getItem("jinrou.name") || "", avatar: localStorage.getItem("jinrou.avatar") || "" };

export function triggerConfetti(container = $("#phone")) {
  if (!container) return;
  const wrap = document.createElement("div");
  wrap.className = "mash-celebration";
  const colors = ["#f59e0b", "#fbbf24", "#38bdf8", "#34d399", "#f43f5e", "#fff"];
  for (let i = 0; i < 35; i++) {
    const c = document.createElement("div");
    c.className = "mash-confetti";
    c.style.setProperty("--c", colors[i % colors.length]);
    c.style.setProperty("--x", `${Math.random() * 95}%`);
    c.style.setProperty("--drift", `${(Math.random() - 0.5) * 80}px`);
    c.style.animationDelay = `${Math.random() * 0.8}s`;
    c.style.animationDuration = `${1.6 + Math.random() * 1}s`;
    wrap.appendChild(c);
  }
  container.appendChild(wrap);
  setTimeout(() => wrap.remove(), 2800);
}

/* ---------------- 投票時の断罪ハンマー・執行カットイン ---------------- */
export function triggerJudgeEffect(targetName) {
  const p = $("#phone");
  if (!p) return;
  const overlay = document.createElement("div");
  overlay.className = "judge-overlay";
  overlay.innerHTML = `
    <div class="judge-hammer">🔨</div>
    <div class="judge-stamp">執行確定</div>
    <div class="judge-target-name">対象：${esc(targetName)}</div>
  `;
  p.appendChild(overlay);
  setTimeout(() => overlay.remove(), 850);
}

/* ------------------------------ 共通パーツ ------------------------------ */
const roomBar = () => S.roomId && S.room ? `
<div class="room-bar">
  <span class="room-bar__id">ROOM: <b>${esc(S.roomId)}</b>${S.room.turn ? ` <span>（ターン ${S.room.turn}/${S.room.maxTurns}）</span>` : ""}</span>
  <button type="button" class="room-leave-btn" data-leave-room>🚪 ルームを抜ける</button>
</div>` : "";

const shell = ({ phase = "night", bg = "bg_night", body, footer = "" }) => `
<section class="screen is-active" data-phase="${phase}">
  <div class="screen__bg"><img src="img/${bg}.svg" alt="" width="390" height="844"></div>
  ${roomBar()}
  <div class="screen__body">${body}</div>
  <div class="screen__footer">${footer}</div>
</section>`;
const forceBtn = (label = "（オーナー）全員を待たず次へ進める") =>
  isHost() ? `<button type="button" class="btn btn--ghost" id="forceBtn">${label}</button>` : "";
const okFooter = (label, color = "") => `<button type="button" class="btn btn--solid ${color}" id="okBtn">${esc(label)}</button>${forceBtn()}`;
const ring = (total, cls = "ring--sm", c = "var(--accent)") =>
  `<div class="ring ${cls}" data-ring="${total}" style="--c:${c}"><div class="ring__text"><span data-time>--</span></div></div>`;
const avImg = (uid, cls = "avatar", size = 30) => `<img class="${cls}" src="${avatarOf(uid)}" alt="" width="${size}" height="${size}">`;
const spectator = (text = "奇跡の医者や報酬で復活する可能性があるため、そのまま静観してください。") => `
<div class="card card--glow card--red center spectator">
  <div class="art"><img src="img/icon_spectator.svg" alt="" width="400" height="260"></div>
  <h2 class="big">あなたは死亡しています</h2><p class="muted">${text}</p>
</div>`;
const picksHtml = (name, list, cls = "", { allowSkip = false } = {}) => `<div class="picklist ${cls}">${list.map((p) => `
  <label class="pick${p.alive ? "" : " is-dead"}"><input type="radio" name="${name}" value="${p.uid}"><span class="radio" aria-hidden="true"></span>
  ${avImg(p.uid, "avatar", 28)}<span class="pick__name">${esc(p.name)}</span></label>`).join("")}${allowSkip ? `
  <label class="pick pick--skip"><input type="radio" name="${name}" value="__skip__"><span class="radio" aria-hidden="true"></span>
  <span class="pick__skip-ico" aria-hidden="true">🚫</span><span class="pick__name">誰にも投票しない（スキップ）</span></label>` : ""}</div>`;
const checkedVal = (name, r = root) => $(`input[name="${name}"]:checked`, r)?.value ?? null;
const lockInputs = (r, sel = "input,button.lockable") => $$(sel, r).forEach((e) => { e.disabled = true; });

export function showDialog({ ico = "🔮", title = "", body = "", note = "" }) {
  $("#resIco").textContent = ico;
  $("#resTitle").textContent = title;
  $("#resBody").innerHTML = body;
  $("#resNote").textContent = note;
  if (!dlg.open) dlg.showModal();
}
dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });

/** ルーム退室・解散の警告確認モーダルを表示 */
export function confirmLeaveRoom() {
  if (!leaveDlg) {
    if (confirm(isHost() ? "本当にルームを解散してトップへ戻りますか？" : "本当にルームを抜けてトップへ戻りますか？")) {
      window.dispatchEvent(new CustomEvent("jinrou:leave"));
    }
    return;
  }
  const host = isHost();
  const playing = S.room?.status === "playing";
  $("#leaveTitle").textContent = host ? "本当にルームを解散しますか？" : "本当にルームを抜けますか？";
  $("#leaveBody").innerHTML = host
    ? `あなたはオーナーのため、抜けると<span class="wolf">ルーム全体が解散</span>され、参加中の全プレイヤーがトップ画面へ戻ります。`
    : playing
      ? `現在ゲーム進行中です。<br>ルーム（<span class="human">${esc(S.roomId)}</span>）を抜けてトップ画面へ戻りますか？`
      : `ルーム（<span class="human">${esc(S.roomId)}</span>）から退室してトップ画面へ戻ります。よろしいですか？`;
  $("#leaveNote").textContent = host
    ? "※解散したルームは元に戻せません。"
    : "※ゲーム中に抜けた場合でも、同じルームIDを入力すれば再接続できます。";
  $("#btnLeaveConfirm").textContent = host ? "はい、解散して抜ける" : "はい、ルームを抜ける";
  if (!leaveDlg.open) leaveDlg.showModal();
}
leaveDlg?.addEventListener("click", (e) => { if (e.target === leaveDlg) leaveDlg.close(); });
$("#btnLeaveCancel")?.addEventListener("click", () => leaveDlg?.close());
$("#btnLeaveConfirm")?.addEventListener("click", () => {
  leaveDlg?.close();
  window.dispatchEvent(new CustomEvent("jinrou:leave"));
});
phone.addEventListener("click", (e) => {
  if (e.target.closest("[data-leave-room]")) confirmLeaveRoom();
});

function syncOk(r, required, label, canOk = true) {
  const btn = $("#okBtn", r);
  if (!btn) return;
  const seq = S.room.phaseSeq;
  const done = (me()?.readySeq || 0) >= seq;
  const n = required.filter((p) => (p.readySeq || 0) >= seq).length;
  if (!required.some((p) => p.uid === S.uid)) {
    btn.disabled = true;
    btn.textContent = `観戦中（${n}/${required.length}）`;
    return;
  }
  btn.disabled = done || !canOk;
  btn.textContent = done ? `みんなを待っています…（${n}/${required.length}）` : label;
}
function bindCommon(r, before) {
  $("#okBtn", r)?.addEventListener("click", async (e) => {
    e.currentTarget.disabled = true;
    try { await before?.(); await Room.markReady(); } catch (err) { alert("通信エラー: " + err.message); }
  });
  $("#forceBtn", r)?.addEventListener("click", () => Host.force());
}

/* ------------------------------ 画面定義 ------------------------------ */
const SCREENS = {};

/* ---- 接続中 ---- */
SCREENS.loading = {
  build: () => shell({ phase: "intro", bg: "bg_title", body: `<div class="card card--blue center" style="margin:auto"><p class="big" id="loadMsg">接続中…</p><div class="spinner"></div></div>` }),
};

/* ---- 01 トップ ---- */
SCREENS.title = {
  build() {
    const qRoom = new URLSearchParams(location.search).get("room") || "";
    return shell({
      phase: "night", bg: "bg_title",
      body: `
      <img class="title-logo" src="img/logo_title.svg" alt="人狼ゲーム TASK & MYSTERY WEREWOLF" width="400" height="300" fetchpriority="high">
      <div class="card card--blue">
        <h2 class="card__title"><span class="dot"></span>プレイヤー情報 ＆ 顔アイコン登録</h2>
        <div class="selfie-box">
          <div class="selfie-frame">
            <img id="selfiePreview" src="${profile.avatar || "img/avatar_01.svg"}" alt="あなたの顔アイコンプレビュー" width="68" height="68">
            <video id="selfieVideo" width="68" height="68" muted playsinline aria-hidden="true" hidden></video>
          </div>
          <div class="selfie-actions">
            <button type="button" class="btn btn--cyan btn--sm" id="btnCameraToggle">📷 カメラを起動して顔を撮影</button>
            <label class="btn btn--ghost btn--sm selfie-upload-label" for="selfieFileInput">📁 標準カメラ / 写真から選ぶ</label>
            <input id="selfieFileInput" type="file" accept="image/*" capture="user" hidden>
          </div>
        </div>
        <div class="field"><label for="name">プレイヤー名（8文字まで）</label>
          <input id="name" class="input" type="text" value="${esc(profile.name)}" placeholder="プレイヤー名を入力" autocomplete="nickname" maxlength="8"></div>
      </div>
      <div class="card">
        <div class="row-between">
          <span style="font-size:12px;font-weight:800;color:var(--muted)">最大ターン数（デフォルト5）</span>
          <span class="stepper"><button type="button" id="turnMinus" aria-label="ターン数を減らす">−</button><b id="turnVal">5</b><button type="button" id="turnPlus" aria-label="ターン数を増やす">＋</button><span style="font-size:11px;font-weight:800;color:var(--muted)">ターン</span></span>
        </div>
        <button type="button" class="btn btn--cyan" id="btnCreate">ルーム作成（オーナー）</button>
        <hr class="divider">
        <div class="field"><label for="roomid">ルームIDを入力して参加</label>
          <div class="input-row"><input id="roomid" class="input" type="text" value="${esc(qRoom.toUpperCase())}" placeholder="ルームID" maxlength="4" autocapitalize="characters" autocomplete="off">
          <button type="button" class="btn btn--solid btn--cyan" id="btnJoin">入室</button></div></div>
        <p class="muted center" id="titleErr" style="color:var(--red);font-weight:800" role="alert"></p>
      </div>
      <p class="hint-line">スマホ・対面でも遠隔でも遊べる 最大10人の人狼ゲーム</p>`,
    });
  },
  bind(r) {
    let turns = 5, stream = null;
    const preview = $("#selfiePreview", r), video = $("#selfieVideo", r), camBtn = $("#btnCameraToggle", r), file = $("#selfieFileInput", r), nameEl = $("#name", r);
    const err = (m) => { $("#titleErr", r).textContent = m || ""; };
    const stopCam = () => {
      stream?.getTracks().forEach((t) => t.stop());
      stream = null; video.srcObject = null; video.hidden = true; preview.hidden = false;
      camBtn.textContent = "📷 カメラを起動して顔を撮影";
    };
    addCleanup(stopCam);
    const apply = (el, w, h, mirror) => {
      const size = 144, c = document.createElement("canvas");
      c.width = c.height = size;
      const g = c.getContext("2d"), m = Math.min(w, h);
      if (mirror) { g.translate(size, 0); g.scale(-1, 1); }
      g.drawImage(el, (w - m) / 2, (h - m) / 2, m, m, 0, 0, size, size);
      let url = c.toDataURL("image/webp", 0.75);
      if (!url.startsWith("data:image/webp")) url = c.toDataURL("image/jpeg", 0.75);
      profile.avatar = url;
      preview.src = url;
      try { localStorage.setItem("jinrou.avatar", url); } catch { /* 容量超過は無視 */ }
    };
    camBtn.addEventListener("click", async () => {
      if (stream && !video.hidden) { apply(video, video.videoWidth || 144, video.videoHeight || 144, true); stopCam(); return; }
      if (!navigator.mediaDevices?.getUserMedia) { file.click(); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 480 } }, audio: false });
        video.srcObject = stream; preview.hidden = true; video.hidden = false;
        await video.play();
        camBtn.textContent = "📸 パシャ！撮影して決定";
      } catch { stopCam(); file.click(); }
    });
    file.addEventListener("change", () => {
      const f = file.files?.[0];
      if (!f) return;
      const url = URL.createObjectURL(f);
      const im = new Image();
      im.onload = () => { apply(im, im.naturalWidth, im.naturalHeight, false); URL.revokeObjectURL(url); stopCam(); };
      im.src = url;
    });
    const setTurns = (d) => { turns = Math.max(1, Math.min(10, turns + d)); $("#turnVal", r).textContent = turns; };
    $("#turnMinus", r).addEventListener("click", () => setTurns(-1));
    $("#turnPlus", r).addEventListener("click", () => setTurns(1));
    const getName = () => {
      const n = nameEl.value.trim();
      if (!n) { err("プレイヤー名を入力してください"); nameEl.focus(); return null; }
      profile.name = n; localStorage.setItem("jinrou.name", n);
      return n;
    };
    const run = async (btn, fn) => {
      err(""); btn.disabled = true;
      try { stopCam(); await fn(); } catch (e) { err(e.message || String(e)); btn.disabled = false; }
    };
    $("#btnCreate", r).addEventListener("click", (e) => {
      const name = getName(); if (!name) return;
      run(e.currentTarget, async () => window.dispatchEvent(new CustomEvent("jinrou:enter", { detail: await Room.createRoom({ name, avatar: profile.avatar, maxTurns: turns }) })));
    });
    $("#btnJoin", r).addEventListener("click", (e) => {
      const name = getName(); if (!name) return;
      const id = $("#roomid", r).value.trim().toUpperCase();
      if (id.length !== 4) { err("ルームIDは4文字です"); return; }
      run(e.currentTarget, async () => window.dispatchEvent(new CustomEvent("jinrou:enter", { detail: await Room.joinRoom(id, { name, avatar: profile.avatar }) })));
    });
  },
};

/* ---- 02/03 ロビー ---- */
SCREENS.lobby = {
  build() {
    const host = isHost();
    const config = host ? `
      <div class="card card--red">
        <div class="row-between"><h2 class="card__title"><span class="dot"></span>人狼陣営の配分（計 <span id="wolfTotal">0</span>人）</h2>
        <span class="stepper"><button type="button" id="turnMinus" aria-label="ターン数を減らす">−</button><b id="turnVal">5</b><button type="button" id="turnPlus" aria-label="ターン数を増やす">＋</button><small style="font-weight:800;color:var(--muted)">ターン</small></span></div>
        <div class="config-grid-2">${WOLF_CONFIG.map((w) => `
          <div class="switch" style="cursor:default"><span class="nm">${w.e} ${ROLES[w.id].name}</span>
          <span class="stepper"><button type="button" data-wolf="${w.id}" data-d="-1" aria-label="${ROLES[w.id].name}を減らす">−</button><b id="wc-${w.id}">0</b><button type="button" data-wolf="${w.id}" data-d="1" aria-label="${ROLES[w.id].name}を増やす">＋</button></span></div>`).join("")}</div>
      </div>
      <div class="card card--blue">
        <div class="row-between"><h2 class="card__title"><span class="dot"></span>市民特別枠（0 or 1人）</h2><span class="chip">🏠 市民自動割当: <b id="autoCitizen">0人</b></span></div>
        <div class="config-grid-2">${CITIZEN_CONFIG.map((c) => `
          <label class="switch"><span class="nm">${c.e} ${ROLES[c.id].name}${c.sub ? `<small>${c.sub}</small>` : ""}</span><input type="checkbox" data-cit="${c.id}" aria-label="${ROLES[c.id].name}"></label>`).join("")}</div>
      </div>
      <div class="total-bar" id="totalBar"><span>配役合計</span><b id="totalVal"></b></div>`
      : `<div class="card card--blue center"><p class="muted" style="color:#dbe5ff;font-weight:800">オーナーが役職を設定中です…<br>しばらくお待ちください</p><div class="spinner" role="status" aria-label="読み込み中"></div></div>
         <div class="card"><div class="row-between"><b>ターン数</b><b class="accent" id="turnShow"></b></div><div class="muted">役職配分は開始時に抽選され、本人にだけ表示されます。</div></div>`;
    return shell({
      body: `
      <div class="hdr">
        <div><div class="roomtag">ルームID（タップで招待リンクをコピー）</div><button type="button" class="big-id" id="roomIdBtn" style="background:none;border:0;padding:0;cursor:pointer;text-align:left">${esc(S.roomId)}</button></div>
        <div style="display:flex;gap:5px;align-items:center"><span class="chip chip--accent">全<b id="turnChip">5</b>ターン</span><span class="chip chip--green" id="cntChip"></span></div>
      </div>
      <div class="card"><div class="avatar-grid" id="lobbyAvatars"></div></div>
      ${config}`,
      footer: `${host ? `<button type="button" class="btn btn--solid btn--red" id="startBtn">ゲーム開始</button><p class="muted center" id="startErr" style="color:var(--amber)"></p>` : ""}
        <button type="button" class="btn btn--ghost" id="leaveBtn">${host ? "ルームを解散してトップへ" : "退室してトップへ"}</button>`,
    });
  },
  bind(r) {
    $("#roomIdBtn", r).addEventListener("click", async () => {
      const url = `${location.origin}${location.pathname}?room=${S.roomId}`;
      try { await navigator.clipboard.writeText(url); showDialog({ ico: "📋", title: "招待リンクをコピーしました", body: `<span style="font-size:14px">${esc(url)}</span>`, note: "LINEなどで友だちに送ってください" }); }
      catch { prompt("招待リンク", url); }
    });
    $("#leaveBtn", r).addEventListener("click", () => confirmLeaveRoom());
    if (!isHost()) return;
    $("#turnMinus", r).addEventListener("click", () => Host.setMaxTurns((S.room.maxTurns || 5) - 1));
    $("#turnPlus", r).addEventListener("click", () => Host.setMaxTurns((S.room.maxTurns || 5) + 1));
    r.addEventListener("click", (e) => {
      const b = e.target.closest("[data-wolf]");
      if (!b) return;
      const id = b.dataset.wolf;
      Host.updateConfig({ [id]: Math.max(0, Math.min(4, (Number(S.room.roleConfig[id]) || 0) + Number(b.dataset.d))) });
    });
    r.addEventListener("change", (e) => { if (e.target.dataset.cit) Host.updateConfig({ [e.target.dataset.cit]: e.target.checked }); });
    $("#startBtn", r).addEventListener("click", async (e) => {
      e.currentTarget.disabled = true;
      try { await Host.startGame(); } catch (err) { $("#startErr", r).textContent = err.message; e.currentTarget.disabled = false; }
    });
  },
  update(r) {
    const room = S.room, list = sortedPlayers();
    $("#turnChip", r).textContent = room.maxTurns;
    $("#cntChip", r).textContent = `${list.length} / ${MAX_PLAYERS}人`;
    $("#lobbyAvatars", r).innerHTML = list.map((p) => `<div class="av${p.uid === room.hostUid ? " is-owner" : ""}${p.uid === S.uid ? " is-me" : ""}">${avImg(p.uid, "avatar", 38)}<span>${esc(p.name)}</span></div>`).join("");
    if (!isHost()) { $("#turnShow", r).textContent = `${room.maxTurns}ターン`; return; }
    $("#turnVal", r).textContent = room.maxTurns;
    const cfg = room.roleConfig, c = roleCounts(cfg, list.length);
    WOLF_CONFIG.forEach((w) => { $(`#wc-${w.id}`, r).textContent = cfg[w.id] || 0; });
    $$("[data-cit]", r).forEach((el) => { el.checked = !!cfg[el.dataset.cit]; });
    $("#wolfTotal", r).textContent = c.wolf;
    $("#autoCitizen", r).textContent = `${Math.max(c.auto, 0)}人`;
    $("#totalBar", r).classList.toggle("is-bad", c.auto < 0 || c.wolf < 1);
    $("#totalVal", r).textContent = c.auto < 0 ? `${c.wolf + c.special} / ${list.length}人（超過）` : c.wolf < 1 ? "人狼陣営が0人です" : `${list.length} / ${list.length}人`;
    const err = Host.validateStart();
    $("#startBtn", r).disabled = !!err;
    $("#startErr", r).textContent = err || "";
  },
};

/* ---- 04 役職発表 ---- */
SCREENS.role = {
  build() {
    ctx = { revealed: false };
    return shell({
      body: `
      <h1 class="hdr__title" style="justify-content:center">あなたの役職は…？</h1>
      <button type="button" class="flip" id="flip" aria-label="カードをタップして役職を確認">
        <div class="flip__inner">
          <div class="flip__face"><img src="img/role_card_back.jpg" alt="役職カード（裏面）" width="571" height="1024"></div>
          <div class="flip__face flip__front"><img id="roleImg" src="img/role_card_back.jpg" alt="役職カード" width="571" height="1024"></div>
        </div>
      </button>
      <p class="hint-line" id="flipHint">👆 カードをタップしてめくる（他の人に見えないように！）</p>
      <div class="card card--glow" id="roleInfo" hidden>
        <h2 class="card__title"><span class="dot"></span><span id="roleName"></span><span class="chip" id="roleFaction" style="margin-left:auto"></span></h2>
        <p class="muted" id="roleDesc"></p><div id="roleExtra"></div>
      </div>`,
      footer: okFooter("確認しました（OK）"),
    });
  },
  bind(r) {
    bindCommon(r);
    $("#flip", r).addEventListener("click", () => {
      if (!S.secret) return;
      ctx.revealed = true;
      r.removeAttribute("data-role-unrevealed");
      SCREENS.role.update(r);
    });
  },
  update(r) {
    if (!ctx.revealed) {
      r.setAttribute("data-role-unrevealed", "");
    } else {
      r.removeAttribute("data-role-unrevealed");
    }
    const s = S.secret;
    if (s) {
      const def = ROLES[s.role];
      $("#roleImg", r).src = def.img;
      $("#roleName", r).textContent = def.name;
      $("#roleDesc", r).textContent = def.desc;
      const wolf = def.team === "wolf";
      $("#roleFaction", r).textContent = wolf ? "人狼陣営" : "市民陣営";
      $("#roleFaction", r).className = "chip " + (wolf ? "chip--red" : "chip--accent");
      r.style.setProperty("--accent", wolf ? "var(--red)" : "var(--cyan)");
      let extra = "";
      if (s.allRoles) extra = `<div class="muted" style="font-size:11px;color:#fda4af">👁️ 全役職：${Object.entries(s.allRoles).filter(([u]) => u !== S.uid).map(([u, ro]) => `${esc(nameOf(u))}(${ROLES[ro].name})`).join("・")}</div>`;
      else if (s.mates?.length) extra = `<div class="muted" style="font-size:11px;color:#fda4af">🐺 仲間：${s.mates.map((u) => esc(nameOf(u))).join("・")}</div>`;
      if (s.partner) extra = `<div class="muted" style="font-size:11px;color:#f9a8d4">💕 相方：${esc(nameOf(s.partner))} さん</div>`;
      $("#roleExtra", r).innerHTML = extra;
    }
    $("#flip", r).classList.toggle("is-flipped", ctx.revealed);
    $("#roleInfo", r).hidden = !ctx.revealed;
    $("#flipHint", r).hidden = ctx.revealed;
    syncOk(r, playerList(), "確認しました（OK）", ctx.revealed);
  },
};

/* ---- 05 自己紹介 ---- */
SCREENS.intro = {
  build: () => shell({
    phase: "intro", bg: "bg_day",
    body: `
    <div class="hdr"><h1 class="hdr__title">💬 自己紹介タイム</h1><span class="chip chip--accent">目安 3分</span></div>
    ${ring(TIME.intro, "", "var(--accent)")}
    <div class="bubble">リアルで順番に自己紹介をしましょう！</div>
    <div class="card"><h2 class="card__title">話す順番（全員の顔アイコン＆名前）</h2>
      <div class="order">${(S.room.order || []).map((u, i) => `<span class="step">${avImg(u, "avatar avatar--sm", 22)}${i + 1}.${esc(nameOf(u))}</span>`).join("")}</div></div>`,
    footer: okFooter("次へ（初日の夜へ）"),
  }),
  bind: bindCommon,
  update: (r) => syncOk(r, playerList(), "次へ（初日の夜へ）"),
};

/* ---- 06/13 夜のスキル（初日の夜も共通） ---- */
function buildNight(night0) {
  const role = S.secret?.role, flags = night0 ? {} : Host.flagsOf(S.room);
  const imAlive = me()?.alive;
  const cap = capabilities(role, { allSeer: flags.allSeer, allKnight: flags.allKnight }, { doctorUsed: S.secret?.doctorUsed });
  if (night0) { cap.medium = false; cap.guard = false; cap.attack = false; cap.doctor = false; }
  ctx = { cap, used: { seer: false, medium: false }, night0, locked: false };
  const others = playerList().filter((p) => p.uid !== S.uid && p.alive);
  const cards = [];
  if (imAlive) {
    if (cap.seer) {
      cards.push(`<div class="card card--amber"><h2 class="card__title"><span class="dot"></span>🔮【占い師】占う相手を1人選択${night0 ? "（初日返り討ち無効）" : ""}</h2>
        ${flags.seerOff ? `<p class="muted" style="color:var(--red)">⚠️ 罰により今夜の占いは無効になります</p>` : ""}
        ${picksHtml("seer", others, "picklist--3")}
        <button type="button" class="btn btn--amber btn--sm lockable" id="seerBtn">🔮 占う（その場で結果表示）</button></div>`);
    }
    if (cap.medium) cards.push(`<div class="card card--violet"><h2 class="card__title"><span class="dot"></span>🕯️【霊媒師】直前の追放者を霊媒</h2><button type="button" class="btn btn--violet btn--sm lockable" id="mediumBtn">霊媒する（その場で結果表示）</button></div>`);
    if (cap.guard) cards.push(`<div class="card card--green"><h2 class="card__title"><span class="dot"></span>🛡️護衛対象を選択${flags.allKnight ? "（報酬：全員ナイト）" : ""}</h2>${picksHtml("guard", others, "picklist--3")}</div>`);
    if (cap.attack) {
      const mates = S.secret?.mates || [];
      cards.push(`<div class="card card--red"><h2 class="card__title"><span class="dot"></span>🐺 人狼の夜襲（仲間と多数決・同票ランダム）</h2>
        <p class="muted">仲間：${mates.length ? mates.map((u) => esc(nameOf(u))).join("・") : "なし"}${flags.noAttack ? " ／ ⚠️報酬により今夜の夜襲は封じられます" : ""}${flags.extraAttack ? " ／ 💀罰：今夜は対象が＋1人" : ""}</p>
        ${picksHtml("attack", others.filter((p) => !mates.includes(p.uid)), "picklist--3")}</div>`);
    }
    if (cap.doctor) {
      const dead = playerList().filter((p) => !p.alive);
      if (dead.length) cards.push(`<div class="card card--green"><h2 class="card__title"><span class="dot"></span>💉【奇跡の医者】蘇生対象（ゲーム中1回）</h2>
        <div class="picklist picklist--3"><label class="pick"><input type="radio" name="doctor" value="" checked><span class="radio"></span><span class="pick__name">使わない</span></label>${dead.map((p) => `
        <label class="pick is-dead"><input type="radio" name="doctor" value="${p.uid}"><span class="radio"></span>${avImg(p.uid, "avatar", 28)}<span class="pick__name">${esc(p.name)}</span></label>`).join("")}</div></div>`);
      else ctx.cap.doctor = false;
    }
  }
  const acts = Object.entries(ctx.cap).some(([k, v]) => v && k !== "doctor") || ctx.cap.doctor;
  let body;
  if (!imAlive) body = spectator();
  else if (!acts || !cards.length) {
    body = `<div class="card card--blue center"><h2 class="big">${night0 ? "初日の夜です" : "【行動なし】"}</h2>
      <p class="muted" style="color:#dbe5ff">${night0 ? "誰も殺されません。役職の説明を確認して、OKをタップしてください。" : "夜の行動はありません。<br>説明文を読んで、下のOKをタップしてください。"}</p>
      <p class="muted">（全員が同じ動作をするので、スマホ操作から役職がバレません）</p></div>
      ${S.secret?.mates?.length ? `<div class="card card--red"><p class="muted">🐺 仲間：${S.secret.mates.map((u) => esc(nameOf(u))).join("・")}</p></div>` : ""}`;
  } else body = cards.join("");
  const eff = !night0 && S.room.effectState?.applied ? `<span class="chip chip--${S.room.effectState.type === "reward" ? "green" : "red"}">${esc(EFFECTS.find((e) => e.id === S.room.effectState.id)?.short ?? "")}</span>` : "";
  return shell({
    body: `<div class="hdr"><h1 class="hdr__title">🌙 ${night0 ? "初日の夜（0ターン目）" : "夜：スキル"}</h1><div style="display:flex;gap:4px;align-items:center">${eff}${night0 ? "" : ring(TIME.skill)}</div></div>${body}`,
    footer: okFooter("OK（夜の行動完了）", "btn--violet"),
  });
}
function bindNight(r) {
  bindCommon(r);
  const c = ctx;
  r.addEventListener("change", (e) => {
    const t = e.target;
    if (t.name === "guard") Room.sendAction({ guardTarget: t.value });
    if (t.name === "attack") Room.sendAction({ attackTarget: t.value });
    if (t.name === "doctor") Room.sendAction({ reviveTarget: t.value || null });
    SCREENS[c.night0 ? "night0" : "skill"].update(r);
  });
  $("#seerBtn", r)?.addEventListener("click", () => {
    const v = checkedVal("seer", r);
    if (!v) return;
    c.used.seer = true;
    Room.sendAction({ seerTarget: v });
    $$('input[name="seer"]', r).forEach((i) => { i.disabled = true; });
    $("#seerBtn", r).disabled = true;
    $("#seerBtn", r).textContent = "占い済み（結果を待っています…）";
    SCREENS[c.night0 ? "night0" : "skill"].update(r);
  });
  $("#mediumBtn", r)?.addEventListener("click", () => {
    c.used.medium = true;
    Room.sendAction({ mediumReq: true });
    $("#mediumBtn", r).disabled = true;
    $("#mediumBtn", r).textContent = "霊媒済み（結果を待っています…）";
    SCREENS[c.night0 ? "night0" : "skill"].update(r);
  });
}
function updateNight(r) {
  const c = ctx, imAlive = me()?.alive;
  const needSeer = c.cap.seer && imAlive, needMed = c.cap.medium && imAlive;
  let ok = true;
  if (needSeer && !c.used.seer) ok = false;
  if (needMed && !c.used.medium) ok = false;
  if (c.cap.guard && imAlive && !checkedVal("guard", r)) ok = false;
  if (c.cap.attack && imAlive && !checkedVal("attack", r)) ok = false;
  const required = c.night0 ? playerList().filter((p) => p.alive) : aliveList();
  syncOk(r, required, "OK（夜の行動完了）", ok);
  if (me()?.readySeq === S.room.phaseSeq && !c.locked) { c.locked = true; $$("input", r).forEach((i) => { i.disabled = true; }); $$("button.lockable", r).forEach((b) => { b.disabled = true; }); }
}
SCREENS.night0 = { build: () => buildNight(true), bind: bindNight, update: updateNight };
SCREENS.skill = { build: () => buildNight(false), bind: bindNight, update: updateNight };

/* ---- 07 朝①：前夜の結果 ---- */
SCREENS.morning_report = {
  build() {
    const r0 = S.room, rep = r0.morningReport || { exiled: [], victims: [], revived: [] };
    const names = (arr) => (arr.length ? arr.map((u) => esc(nameOf(u))).join("・") : "なし");
    const row = (ico, label, arr) => `<div class="event">${arr.length ? avImg(arr[0], "avatar", 30) : `<div class="event__ico">${ico}</div>`}<div><div class="event__label">${label}</div><div class="event__val">${names(arr)}</div></div></div>`;
    const final = r0.turn > r0.maxTurns;
    const alive = aliveList().length, total = playerList().length;
    const isTie = (rep.tieCandidates?.length || 0) >= 2 && rep.exiled?.length > 0;
    const exileLabel = isTie
      ? `⚖️ 追放された人 <span class="chip chip--amber" style="font-size:10px;padding:1px 6px;margin-left:4px">🎰 同票ルーレット決着（候補：${rep.tieCandidates.map((u) => esc(nameOf(u))).join("・")}）</span>`
      : "⚖️ 追放された人";
    return shell({
      phase: "morning", bg: "bg_morning",
      body: `
      <div class="hdr"><h1 class="hdr__title">${final ? "🌅 最終ターン終了" : `☀️ ${r0.turn}ターン目の朝`}</h1><span class="chip chip--accent">ターン ${Math.min(r0.turn, r0.maxTurns)} / ${r0.maxTurns}</span></div>
      <div class="hero"><img src="img/hero_morning.svg" alt="" width="600" height="240" fetchpriority="high"></div>
      <div class="card"><div class="row-between"><b>現在の生存者</b><b class="accent">${alive}人 / ${total}人</b></div><div class="stat-bar"><i style="--w:${Math.round((alive / total) * 100)}%"></i></div></div>
      <div class="card card--red"><h2 class="card__title"><span class="dot"></span>${r0.turn === 1 && !rep.exiled.length && !rep.victims.length ? "初日の夜は誰も犠牲になりませんでした" : "昨晩の追放・夜襲・復活発表"}</h2>
        <div class="events">${row("⚖️", exileLabel, rep.exiled)}${row("🐺", "🐺 昨晩の犠牲者", rep.victims)}${row("💫", "💉 復活した人", rep.revived)}</div></div>
      ${r0.ending ? `<div class="chip chip--amber center" style="justify-content:center">決着がつきました！</div>` : ""}`,
      footer: okFooter(r0.ending ? "ゲーム結果発表へ" : "本日のタスク発表へ", "btn--amber"),
    });
  },
  bind: bindCommon,
  update: (r) => syncOk(r, playerList(), S.room.ending ? "ゲーム結果発表へ" : "本日のタスク発表へ"),
};

/* ---- 08 朝②：タスク＆報酬発表 ---- */
SCREENS.task_announce = {
  build() {
    const t = S.room.currentTask, task = TASKS.find((x) => x.id === t.id), eff = EFFECTS.find((e) => e.id === S.room.effectState.id);
    const good = eff.type === "reward";
    const topic = t.text ? `<p class="center" style="font-weight:900;font-size:15px;color:var(--amber)">お題：${esc(t.text)}【${t.kind === "hira" ? "ひらがな" : "漢字"}で答えろ】</p>` : "";
    return shell({
      phase: "morning", bg: "bg_morning",
      body: `
      <div class="hdr"><h1 class="hdr__title">🎯 本日のタスク発表！</h1><span class="chip chip--accent">重複なし抽選</span></div>
      <div class="card card--amber"><h2 class="card__title"><span class="dot"></span>本日のミニゲーム</h2>
        <div class="art"><img src="${task.img}" alt="" width="400" height="260"></div>
        <p class="big center">${task.name}</p><p class="muted center">${task.rule.replace("生存人数×100", `生存人数×100＝${t.target}`)}</p>${topic}</div>
      <div class="card card--glow ${good ? "card--green" : "card--red"}"><h2 class="card__title"><span class="dot"></span>今回のタスク効果（1個抽選）<span class="chip ${good ? "chip--green" : "chip--red"}" style="margin-left:auto">${good ? "成功報酬" : "失敗時の罰"}</span></h2>
        <div class="art"><img src="${eff.img}" alt="" width="400" height="260"></div>
        <p style="font-weight:900;font-size:14px;line-height:1.4">${eff.name}</p>
        <p class="muted">${good ? "※タスク成功で効果発動 / 失敗時は何も起きません" : "※タスク失敗で罰が発生 / 成功で回避"}</p></div>`,
      footer: okFooter("タスク開始！", "btn--amber"),
    });
  },
  bind: bindCommon,
  update: (r) => syncOk(r, playerList(), "タスク開始！"),
};

/* ---- 09 朝③：ミニゲーム ---- */
const topicBox = (t, glow) => `<div class="topic" style="--glow:${glow}"><b>お題：${esc(t.text)}</b><small>【${t.kind === "hira" ? "ひらがな" : "漢字"}で答えろ】</small></div>`;
const taskVal = (p) => (p.taskSeq === S.room.phaseSeq ? p.taskV : undefined);
const answeredCount = () => aliveList().filter((p) => taskVal(p) !== undefined).length;
const waitingCard = (msg) => `<div class="card card--blue center"><p class="muted" style="color:#dbe5ff;font-weight:800">${msg}</p><div class="spinner"></div></div>`;

SCREENS.task_play = {
  build() {
    const t = S.room.currentTask, imAlive = me()?.alive;
    ctx = { mine: 0, n: 0, dirty: false, sent: false, t0: 0, raf: 0 };
    let body = "";
    if (!imAlive) body = spectator("ミニゲームは生存者が挑戦中です。");
    else if (t.id === "mash") {
      body = `<div class="mini-top"><h1 class="hdr__title">👆 みんなで連打</h1>${ring(TIME.mash, "ring--sm", "var(--cyan)")}</div>
        <div class="card"><div class="row-between"><b>全員の合計</b><b><span id="mashTotal">0</span> / ${t.target}回</b></div><div class="gauge"><i id="mashGauge" style="--w:0%"></i></div></div>
        <div class="tap-wrap"><button type="button" class="tap" id="tapBtn" aria-label="連打する">TAP!!</button></div>
        <p class="center" style="font-weight:800">あなたの連打数：<b class="accent" style="font-size:20px" id="mashMine">0</b>回</p>`;
    } else if (t.id === "match" || t.id === "unique") {
      const m = t.id === "match";
      body = `<div class="hdr"><h1 class="hdr__title">${m ? "🤝 気持ちを合わせろ" : "🚫 かぶっちゃだめよ"}</h1>${ring(TIME.quiz, "ring--sm", m ? "var(--cyan)" : "var(--amber)")}</div>
        <div class="art"><img src="${TASKS.find((x) => x.id === t.id).img}" alt="" width="400" height="260"></div>
        ${topicBox(t, m ? "var(--cyan)" : "var(--amber)")}
        <div class="field"><label for="ans">あなたの答え</label><input id="ans" class="input" autocomplete="off" maxlength="20"></div>
        <div class="status-row"><span class="chip ${m ? "chip--accent" : "chip--amber"}">${m ? "全員同じ回答でクリア！" : "全員バラバラならクリア！"}</span><span class="chip" id="ansCnt"></span></div>
        <p class="muted center" id="ansErr" style="color:var(--red)"></p>
        <button type="button" class="btn ${m ? "btn--cyan" : "btn--amber"} btn--sm" id="ansBtn">回答決定</button>`;
    } else if (t.id === "relay") {
      body = `<div class="mini-top"><h1 class="hdr__title">⏱️ みんな答えろ</h1>${ring(TIME.relay, "ring--sm", "var(--green)")}</div>
        ${topicBox(t, "var(--green)")}
        <div class="card"><b style="font-size:11px;color:var(--muted)">既出の回答（重複不可）</b><div class="answers" id="relayList"></div></div>
        <p class="center accent" style="font-weight:900;font-size:15px" id="relayTurn"></p>
        <div class="input-row"><input class="input" id="ans" aria-label="あなたの回答" autocomplete="off" maxlength="12"><button type="button" class="btn btn--green" id="ansBtn">送信</button></div>
        <p class="muted center" id="ansErr" style="color:var(--red);min-height:1em"></p>`;
    } else {
      body = `<div class="hdr"><h1 class="hdr__title">🔟 10秒チャレンジ</h1>${ring(TIME.timer, "ring--sm", "var(--amber)")}</div>
        <div class="art"><img src="img/task_timer10.svg" alt="" width="400" height="260"></div>
        <div class="card card--amber center"><p class="big" style="color:var(--amber)">10.0秒ぴったりで止めろ！</p><p class="muted">（9.50〜10.50秒ならクリア・挑戦は1回だけ）</p></div>
        <div class="stopbox" id="stopBox"><span id="stopTime">0.00</span><small>秒</small></div>
        <p class="muted center" id="stopHint">START後、3秒で数字が隠れます。</p>
        <div class="input-row"><button type="button" class="btn btn--green" id="stopStart">START</button><button type="button" class="btn btn--solid btn--red" id="stopBtn" disabled>STOP!!</button></div>`;
    }
    return shell({ phase: "morning", bg: "bg_morning", body, footer: forceBtn("（オーナー）タスクを今すぐ終了する") });
  },
  bind(r) {
    bindCommon(r);
    const t = S.room.currentTask, seq = S.room.phaseSeq, c = ctx;
    if (!me()?.alive) return;
    const ends = () => S.room.phaseEndsAt || 0;
    const send = async (v) => { c.n += 1; try { await Room.sendTask(v, c.n); } catch (e) { console.warn(e); } };
    if (t.id === "mash") {
      const tap = $("#tapBtn", r);
      const onomatopoeia = ["ドガッ！", "ズバッ！", "バババッ！", "ドカン！", "ゴゴゴ！", "ガガガッ！"];
      tap.addEventListener("pointerdown", (e) => {
        if (Date.now() > ends()) return;
        tap.classList.add("is-down"); c.mine += 1; c.dirty = true; SCREENS.task_play.update(r);

        // オノマトペポップアップエフェクト
        const pop = document.createElement("div");
        pop.className = "mash-pop-text";
        pop.textContent = onomatopoeia[Math.floor(Math.random() * onomatopoeia.length)];
        const rect = tap.getBoundingClientRect();
        const rRect = r.getBoundingClientRect();
        const x = rect.left - rRect.left + rect.width / 2 + (Math.random() * 40 - 20);
        const y = rect.top - rRect.top + 20;
        pop.style.left = `${x}px`;
        pop.style.top = `${y}px`;
        pop.style.setProperty("--r", `${Math.random() * 24 - 12}deg`);
        r.appendChild(pop);
        setTimeout(() => pop.remove(), 550);
      });
      ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => tap.addEventListener(ev, () => tap.classList.remove("is-down")));
      const iv = setInterval(() => {
        if (c.dirty) { c.dirty = false; send(c.mine); }
        if (Date.now() > ends() + 1200) clearInterval(iv);
      }, 700);
      addCleanup(() => clearInterval(iv));
    } else if (t.id === "match" || t.id === "unique") {
      $("#ansBtn", r).addEventListener("click", async () => {
        const v = $("#ans", r).value.trim();
        if (!v) { $("#ansErr", r).textContent = "答えを入力してください"; return; }
        if (t.kind === "hira" && !/^[ぁ-んァ-ヶー]+$/.test(v.normalize("NFKC"))) { $("#ansErr", r).textContent = "ひらがなで入力してください"; return; }
        c.sent = true; $("#ansErr", r).textContent = ""; await send(v); SCREENS.task_play.update(r);
      });
    } else if (t.id === "relay") {
      const go = async () => {
        const v = $("#ans", r).value.trim();
        if (!v) return;
        c.lastN = c.n + 1; $("#ans", r).value = ""; await send(v);
      };
      $("#ansBtn", r).addEventListener("click", go);
      $("#ans", r).addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    } else {
      const box = $("#stopBox", r), tm = $("#stopTime", r), hint = $("#stopHint", r), st = $("#stopStart", r), sp = $("#stopBtn", r);
      st.addEventListener("click", () => {
        st.disabled = true; sp.disabled = false; c.t0 = performance.now(); hint.textContent = "10.0秒だと思ったタイミングでSTOP！";
        const loop = () => { const s = (performance.now() - c.t0) / 1000; tm.textContent = s < 3 ? s.toFixed(2) : "??.??"; c.raf = requestAnimationFrame(loop); };
        loop();
      });
      sp.addEventListener("click", async () => {
        cancelAnimationFrame(c.raf);
        const s = (performance.now() - c.t0) / 1000, ok = Math.abs(s - 10) <= 0.5;
        sp.disabled = true; c.sent = true; tm.textContent = s.toFixed(2);
        box.className = "stopbox " + (ok ? "is-ok" : "is-ng");
        hint.textContent = (ok ? "🎉 クリア！" : "💥 残念…") + " 他の人を待っています";
        await send(Number(s.toFixed(3)));
      });
      addCleanup(() => cancelAnimationFrame(c.raf));
    }
  },
  update(r) {
    const t = S.room.currentTask, c = ctx;
    if (!me()?.alive) return;
    if (t.id === "mash") {
      const seq = S.room.phaseSeq;
      const total = aliveList().reduce((a, p) => a + (p.uid === S.uid ? c.mine : p.taskSeq === seq ? Number(p.taskV) || 0 : 0), 0);
      $("#mashTotal", r).textContent = total;
      $("#mashMine", r).textContent = c.mine;
      $("#mashGauge", r).style.setProperty("--w", `${Math.min(100, Math.round((total / t.target) * 100))}%`);
    } else if (t.id === "match" || t.id === "unique") {
      $("#ansCnt", r).textContent = `回答済み ${answeredCount()} / ${aliveList().length}`;
      if (c.sent) { $("#ans", r).disabled = true; $("#ansBtn", r).disabled = true; $("#ansBtn", r).textContent = "回答済み（他の人を待っています）"; }
    } else if (t.id === "relay") {
      const rel = S.room.relay, cur = rel.order[rel.idx], myTurn = cur === S.uid;
      $("#relayList", r).innerHTML = rel.answers.length ? rel.answers.map((a) => `<span class="chip">${esc(a.text)}</span>`).join("") : `<span class="muted">まだありません</span>`;
      const done = rel.order.indexOf(S.uid) < rel.idx;
      $("#relayTurn", r).textContent = rel.idx >= rel.order.length ? "全員回答しました！" : myTurn ? "👉 あなたの手番です！" : done ? `回答済み！ 次は ${nameOf(cur)} さん` : `${nameOf(cur)} さんの番です`;
      $("#ans", r).disabled = !myTurn; $("#ansBtn", r).disabled = !myTurn;
      $("#ansErr", r).textContent = rel.err?.uid === S.uid && rel.err.n === c.lastN ? rel.err.msg : "";
    }
  },
};

/* ---- 10 朝④：タスク結果＆貢献度 ---- */
const contribHtml = () => {
  const res = S.room.taskResult;
  if (!res) return "";
  const max = Math.max(1, ...res.contrib.map((c) => c.score || 0));
  const mvp = [...res.contrib].sort((a, b) => b.score - a.score)[0]?.uid;
  return res.contrib.map((c) => `<div class="contrib__row${c.uid === mvp && c.score > 0 ? " is-mvp" : ""}${c.ok ? "" : " is-low"}">
    ${avImg(c.uid, "avatar", 26)}<b>${esc(nameOf(c.uid))}${c.uid === mvp && c.score > 0 ? "🏅" : ""}</b><span class="val ${c.ok ? "ok" : "ng"}">${esc(c.text)}</span>
    <div class="bar"><i style="--w:${Math.max(8, Math.round(((c.score || 0) / max) * 100))}%"></i></div></div>`).join("");
};
const effectResultText = () => {
  const es = S.room.effectState, eff = EFFECTS.find((e) => e.id === es.id);
  if (es.type === "reward") return es.applied ? `✨ 報酬獲得：${eff.name}${es.wolfAlive != null ? `<br>🐺 人狼陣営の生存数：${es.wolfAlive}人` : ""}` : "（成功報酬は獲得できませんでした）";
  return es.applied ? `💀 罰発生：${eff.short}（今晩）` : "罰を回避しました！";
};
SCREENS.task_result = {
  build() {
    const res = S.room.taskResult, ok = res.success;
    return shell({
      phase: "morning", bg: "bg_morning",
      body: `
      <div class="card card--glow ${ok ? "card--amber" : "card--red"}">
        <h2 class="big center">${ok ? "🎉 タスク成功！" : "💥 タスク失敗…"}</h2>
        <p class="center muted">${esc(res.summary)}</p>
        <p class="center" style="font-weight:800;font-size:12px;color:var(--${ok ? "amber" : "red"})">${effectResultText()}</p></div>
      <div class="card"><h2 class="card__title"><span class="dot"></span>タスク貢献度一覧</h2>
        <p class="muted">人狼がバレないように足を引っ張っていないか推理しましょう！</p><div class="contrib">${contribHtml()}</div></div>`,
      footer: okFooter("昼のターンへ", "btn--cyan"),
    });
  },
  bind: bindCommon,
  update: (r) => syncOk(r, playerList(), "昼のターンへ"),
};

/* ---- 11 昼 ---- */
SCREENS.day = {
  build() {
    const es = S.room.effectState;
    return shell({
      phase: "day", bg: "bg_day",
      body: `
      <div class="hdr"><h1 class="hdr__title">🗣️ 昼のターン：議論中</h1><span class="chip chip--accent">Turn ${Math.min(S.room.turn, S.room.maxTurns)} / ${S.room.maxTurns}</span></div>
      ${ring(TIME.day, "", "var(--accent)")}
      <div class="card"><div class="row-between"><b>プレイヤー状況</b><span class="chip chip--green" id="aliveChip"></span></div><div class="avatar-grid" id="dayAvatars"></div></div>
      <button type="button" class="btn btn--sm" id="btnDayInfo">📊 タスク貢献度・発生中の報酬/罰を確認</button>`,
      footer: okFooter("議論終了（夜のターンへ）"),
    });
  },
  bind(r) {
    bindCommon(r);
    $("#btnDayInfo", r).addEventListener("click", () => {
      const es = S.room.effectState, eff = EFFECTS.find((e) => e.id === es?.id), res = S.room.taskResult;
      const bad = res?.contrib.filter((c) => !c.ok).map((c) => nameOf(c.uid)) || [];
      showDialog({
        ico: "📊", title: "今朝の貢献度・発生中の効果",
        body: `<div style="font-size:13px;text-align:left;font-weight:700;line-height:1.6">${es?.applied ? `${es.type === "reward" ? "✨ 発動中" : "💀 罰"}：${esc(eff.name)}` : "発動中の効果：なし"}<br>${es?.wolfAlive != null ? `🐺 人狼陣営の生存数：${es.wolfAlive}人<br>` : ""}${res ? `🎯 タスク：${res.success ? "成功" : "失敗"}（${esc(res.summary)}）<br>⚠️ 未達：${bad.length ? bad.map(esc).join("・") : "なし"}` : ""}</div>`,
        note: "※画面をスクロールさせずにモーダルで確認できます。",
      });
    });
  },
  update(r) {
    const list = sortedPlayers(), alive = list.filter((p) => p.alive).length;
    $("#aliveChip", r).textContent = `生存 ${alive} / 脱落 ${list.length - alive}`;
    $("#dayAvatars", r).innerHTML = list.map((p) => `<div class="av${p.alive ? "" : " is-dead"}${p.uid === S.uid ? " is-me" : ""}">${avImg(p.uid, "avatar", 38)}<span>${esc(p.name)}</span></div>`).join("");
    syncOk(r, aliveList(), "議論終了（夜のターンへ）");
  },
};

/* ---- 12 追放投票／復活投票 ---- */
function voteScreen(kind) {
  const revive = kind === "revive_vote";
  const field = revive ? "revive" : "target";
  return {
    build() {
      const imAlive = me()?.alive;
      const list = revive ? playerList().filter((p) => !p.alive) : playerList().filter((p) => p.alive && p.uid !== S.uid);
      const flags = Host.flagsOf(S.room);
      ctx = { locked: false };
      let body;
      if (!imAlive) body = spectator("投票は生存者が行っています。");
      else if (revive) body = `<div class="card card--glow card--green center"><h1 class="big" style="color:var(--green)">✨ 報酬発動：脱落者1名復活投票</h1><p class="muted">墓地の脱落者から1名を選んで復活させよう！（人狼が復活する可能性もあり）</p></div>
        <div class="art"><img src="img/effect_revive.svg" alt="" width="400" height="260"></div>${picksHtml("vote", list)}`;
      else body = `<div class="card card--violet"><h2 class="card__title"><span class="dot"></span>追放したいプレイヤーを1人選択</h2>
        <p class="muted">※最多得票が同数の場合は翌朝のルーレットで決定！「誰にも投票しない」も選択可能です。${flags.doubleExile ? "<br>💀罰発動中：上位2名が追放されます！" : ""}</p></div>${picksHtml("vote", list, "", { allowSkip: true })}`;
      return shell({
        body: `<div class="hdr"><h1 class="hdr__title">🌙 夜：${revive ? "復活投票" : "追放投票"}</h1>${ring(revive ? TIME.revive : TIME.vote)}</div>${body}`,
        footer: okFooter(revive ? "復活に投票する" : "投票する", revive ? "btn--green" : "btn--red"),
      });
    },
    bind(r) {
      // 投票内容を先に送信してから準備完了にする
      bindCommon(r, async () => {
        const v = checkedVal("vote", r);
        if (v) {
          triggerJudgeEffect(v === "__skip__" ? "誰にも投票しない" : nameOf(v));
          await Room.sendAction({ [field]: v });
        }
      });
      r.addEventListener("change", () => SCREENS[kind].update(r));
    },
    update(r) {
      const list = (revive ? playerList().filter((p) => !p.alive) : playerList().filter((p) => p.alive && p.uid !== S.uid));
      syncOk(r, aliveList(), revive ? "復活に投票する" : "投票する", !!checkedVal("vote", r) || !list.length);
      if (me()?.readySeq === S.room.phaseSeq && !ctx.locked) { ctx.locked = true; $$("input", r).forEach((i) => { i.disabled = true; }); }
    },
  };
}
SCREENS.vote = voteScreen("vote");
SCREENS.revive_vote = voteScreen("revive_vote");

/* ---- 14 結果発表 ---- */
SCREENS.finished = {
  build() {
    const w = S.room.winner;
    const D = { citizen: ["img/victory_citizen.svg", "🏆 市民陣営 勝利！"], wolf: ["img/victory_wolf.svg", "🐺 人狼陣営 勝利！"], draw: ["img/victory_draw.svg", "⚖️ 引き分け（同数）"] }[w] || ["img/victory_draw.svg", "ゲーム終了"];
    const roles = S.room.finalRoles || {};
    const list = sortedPlayers();
    const aliveRoles = list.filter((p) => p.alive).map((p) => roles[p.uid]);
    const wc = aliveRoles.filter(isWolfTeam).length;
    const winFxClass = w === "wolf" ? "win-fx-wolf" : "win-fx-citizen";
    return shell({
      phase: "win", bg: "bg_result",
      body: `
      <div class="${winFxClass}"></div>
      <div class="hero"><img src="${D[0]}" alt="" width="600" height="300" fetchpriority="high"></div>
      <h1 class="big center">${D[1]}</h1>
      <div class="versus"><div class="cit">市民陣営 生存<b>${aliveRoles.length - wc}人</b></div><div class="vs">VS</div><div class="wol">人狼陣営 生存<b>${wc}人</b></div></div>
      <div class="card"><h2 class="card__title"><span class="dot"></span>全プレイヤーの役職公開（${list.length}名）</h2>
        <div class="role-grid-10">${list.map((p) => `<div class="role-cell${p.alive ? "" : " is-dead"}">${avImg(p.uid, "avatar avatar--sm", 22)}<span class="who">${esc(p.name)}${p.alive ? "" : "†"}</span><span class="${isWolfTeam(roles[p.uid]) ? "tag-w" : "tag-c"}">${ROLES[roles[p.uid]]?.name ?? ""}</span></div>`).join("")}</div></div>`,
      footer: `${isHost() ? `<button type="button" class="btn btn--solid btn--cyan" id="againBtn">もう一度遊ぶ（ロビーへ）</button>` : `<p class="muted center">オーナーが再開するのを待っています…</p>`}
        <button type="button" class="btn btn--ghost" id="topBtn">トップへ戻る</button>`,
    });
  },
  bind(r) {
    $("#againBtn", r)?.addEventListener("click", (e) => { e.currentTarget.disabled = true; Host.resetToLobby(); });
    $("#topBtn", r).addEventListener("click", () => confirmLeaveRoom());
  },
};

/* ------------------------------ 描画ドライバ ------------------------------ */
const screenId = () => (!S.roomId ? "title" : !S.room ? "loading" : S.room.status === "waiting" ? "lobby" : S.room.phase);
export function render() {
  const id = screenId();
  const sc = SCREENS[id];
  if (!sc) return;
  const key = `${id}:${S.room?.phaseSeq ?? 0}`;
  if (key !== lastKey) {
    cleanups.forEach((f) => f());
    cleanups = [];
    if (dlg.open && id !== "title") dlg.close();
    ctx = {};
    phone.innerHTML = sc.build();
    root = phone.firstElementChild;
    sc.bind?.(root);
    lastKey = key;

    // カットシーン演出トリガー（フェーズ切替時に1回再生）
    if (id === "morning_report") {
      playMorningCutscene(S.room?.morningReport, S.room?.turn || 1);
    } else if (id === "day") {
      playDayCutscene(S.room?.turn || 1);
    } else if (id === "night0") {
      playNightCutscene(0, true);
    } else if (id === "vote") {
      playNightCutscene(S.room?.turn || 1, false);
    } else {
      clearCutscene();
    }
  }
  sc.update?.(root);
  showInbox();
}
export function resetView() { lastKey = null; clearCutscene(); }

/* 占い師・霊媒師の即時結果（オーナー端末からの返信を受信したら表示） */
function showInbox() {
  const ib = S.secret?.inbox;
  if (!ib || sessionStorage.getItem("jinrou.inbox") === ib.id + S.roomId) return;
  sessionStorage.setItem("jinrou.inbox", ib.id + S.roomId);
  const tag = (r) => (r === "wolf" ? `<span class="wolf">人狼</span>` : `<span class="human">人間</span>`);
  if (ib.kind === "seer") {
    showDialog({
      ico: "🔮", title: "占い結果（即時表示）",
      body: ib.result === "void" ? `罰の効果で<br>今夜の占いは<em>無効</em>でした…` : `<em>${esc(nameOf(ib.target))}</em> は<br>【${tag(ib.result)}】でした！`,
      note: "※結果はその場ですぐ確認できます。",
    });
  } else {
    showDialog({
      ico: "🕯️", title: "霊媒結果（即時表示）",
      body: ib.results.length ? ib.results.map((x) => `追放された <em>${esc(nameOf(x.uid))}</em> は<br>【${tag(x.result)}】でした！`).join("<br><br>") : "今回は追放者がいませんでした。",
      note: "※直前の追放投票の結果です。",
    });
  }
}

/* 円形タイマー（phaseEndsAt との差分で全端末を同期） */
export function tickUI() {
  const ends = S.room?.phaseEndsAt;
  $$("[data-ring]").forEach((el) => {
    const total = Number(el.dataset.ring), txt = $("[data-time]", el);
    if (!ends) { txt.textContent = "--"; return; }
    const left = Math.max(0, Math.ceil((ends - Date.now()) / 1000));
    el.style.setProperty("--p", Math.min(100, (left / total) * 100));
    txt.textContent = el.classList.contains("ring--sm") ? fmtS(left) : fmt(left);
  });
}
export const setLoading = (msg) => { const el = $("#loadMsg"); if (el) el.textContent = msg; };
export function bootScreen(msg) { phone.innerHTML = SCREENS.loading.build(); setLoading(msg); }
export function fatal(msg, html = "") {
  phone.innerHTML = shell({ phase: "intro", bg: "bg_title", body: `<div class="card card--red center" style="margin:auto"><h2 class="big">⚠️ エラー</h2><p class="muted" style="color:#fecdd3">${esc(msg)}</p>${html}</div>` });
}
