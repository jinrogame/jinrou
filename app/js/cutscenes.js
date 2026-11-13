// ターン開始・切り替わり時のフルスクリーン動画演出（朝・昼・夜）
import { S, nameOf, avatarOf } from "./state.js";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const avImg = (uid, size = 68) =>
  `<img class="cutscene__avatar" src="${avatarOf(uid)}" alt="" width="${size}" height="${size}">`;

let activeOverlay = null;
let activeTimers = [];

const addTimer = (fn, ms) => {
  const id = setTimeout(fn, ms);
  activeTimers.push(id);
  return id;
};

export function clearCutscene() {
  activeTimers.forEach((id) => clearTimeout(id));
  activeTimers = [];
  if (activeOverlay) {
    activeOverlay.querySelectorAll("video").forEach((v) => {
      try {
        v.pause();
        v.removeAttribute("src");
        v.load();
      } catch { /* ignore */ }
    });
    activeOverlay.remove();
    activeOverlay = null;
  }
}

/** 音声付き再生を試み、ブラウザの自動再生制限に引っかかった場合はミュート再生へフォールバック */
async function safePlayVideo(videoEl, { muteVoice = false } = {}) {
  if (!videoEl) return;
  videoEl.playsInline = true;
  if (muteVoice) {
    videoEl.muted = true;
  } else {
    videoEl.muted = false;
    videoEl.volume = 0.85;
  }
  try {
    await videoEl.play();
  } catch {
    videoEl.muted = true;
    try {
      await videoEl.play();
    } catch { /* ignore */ }
  }
}

/** ナイトの盾が狼の爪を弾いたときの金属音・バリア効果音（Web Audio API） */
function playShieldClangSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // 金属のガキン！という高音チャイム＋重低音インパクト
    [520, 780, 1040, 1560].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = i % 2 === 0 ? "triangle" : "sine";
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.08, now + 0.12);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.92, now + 0.65);
      gain.gain.setValueAtTime(0.22 / (i + 1), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.72);
    });
  } catch { /* ignore */ }
}

/** ルーレット回転中のカチッという効果音＆決定時のドラムロール音（Web Audio API） */
let rouletteAudioCtx = null;
function playRouletteSound(isFinal = false) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!rouletteAudioCtx || rouletteAudioCtx.state === "closed") {
      rouletteAudioCtx = new AudioCtx();
    }
    if (rouletteAudioCtx.state === "suspended") {
      rouletteAudioCtx.resume().catch(() => {});
    }
    const ctx = rouletteAudioCtx;
    const now = ctx.currentTime;

    if (!isFinal) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(680, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.045);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.055);
    } else {
      // 決定時のドドン！という重低音＋緊迫ブラス和音
      [146.8, 220, 293.7, 440, 587.3].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = i === 0 ? "sawtooth" : "triangle";
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.98, now + 0.65);
        gain.gain.setValueAtTime(0.2 / (i + 1), now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.68);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.7);
      });
    }
  } catch { /* ignore */ }
}

function mountCutscene(html, durationMs, onDone) {
  clearCutscene();
  const phone = document.getElementById("phone");
  if (!phone) return null;

  const overlay = document.createElement("div");
  overlay.className = "cutscene";
  overlay.innerHTML = html;

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    overlay.classList.add("is-leaving");
    addTimer(() => {
      clearCutscene();
      onDone?.();
    }, 380);
  };

  overlay.querySelector(".cutscene__skip")?.addEventListener("click", (e) => {
    e.stopPropagation();
    finish();
  });

  phone.appendChild(overlay);
  activeOverlay = overlay;
  addTimer(finish, durationMs);
  return { overlay, finish };
}

/**
 * 🌅 朝のカットシーン
 * フェーズ1（0.0s〜2.5s）：朝日が昇る演出 ＆ 昨晩の追放者を大々的に発表
 * フェーズ2（2.5s〜7.8s）：
 *   - 夜襲発生時：`movies/morning_attack.mp4` を全画面再生し、爪が切り裂く瞬間（約2.7秒目）に犠牲者をドカンと発表
 *   - ナイト護衛成功時：前半2.2秒間は `movies/morning_attack.mp4` で狼が飛びかかり、切り裂く直前に聖なる騎士の盾バリアが発動して「誰も襲われなかった！」と発表
 */
export function playMorningCutscene(report, turn, onDone) {
  const exiled = report?.exiled || [];
  const tieCandidates = report?.tieCandidates || [];
  const isTieRoulette = tieCandidates.length >= 2 && exiled.length > 0;
  const victims = report?.victims || [];
  const isNight0 = turn === 1 && !exiled.length && !victims.length && !report?.guardedSuccess && !isTieRoulette;
  const guardedSuccess = !!report?.guardedSuccess;

  const exiledHtml = isTieRoulette
    ? `<div class="cutscene__card cutscene__card--roulette" id="csRouletteCard">
        <div class="cutscene__badge cutscene__badge--amber" id="csRouletteBadge">🎰 得票同数！運命の追放ルーレット</div>
        <div class="roulette-candidates" id="csRoulettePool">
          ${tieCandidates.map((u, idx) => `
            <div class="roulette-cand${idx === 0 ? " is-active" : ""}" data-uid="${esc(u)}">
              ${avImg(u, 42)}
              <span>${esc(nameOf(u))}</span>
            </div>
          `).join("")}
        </div>
        <div class="roulette-stage">
          <div class="roulette-pointer">▼</div>
          <div class="roulette-wheel" id="csRouletteWheel">
            <div class="roulette-wheel__ring"></div>
            <div class="roulette-wheel__center">
              <img class="cutscene__avatar" id="csRouletteAvatar" src="${avatarOf(tieCandidates[0])}" alt="" width="72" height="72">
            </div>
          </div>
          <div class="cutscene__name" id="csRouletteName">${esc(nameOf(tieCandidates[0]))}</div>
        </div>
        <div class="cutscene__desc" id="csRouletteDesc">最多得票が同数のため、ルーレットで追放者を抽選中…</div>
      </div>`
    : exiled.length
    ? `<div class="cutscene__card cutscene__card--exile">
        <div class="cutscene__badge cutscene__badge--red">⚖️ 昨晩の追放投票結果</div>
        <div class="cutscene__person">
          <div class="cutscene__avatar-row">${exiled.map((u) => avImg(u, 72)).join("")}</div>
          <div class="cutscene__name">${exiled.map((u) => esc(nameOf(u))).join("・")}</div>
        </div>
        <div class="cutscene__desc">村人の投票により追放されました</div>
      </div>`
    : `<div class="cutscene__card cutscene__card--safe">
        <div class="cutscene__badge cutscene__badge--cyan">⚖️ 昨晩の追放投票結果</div>
        <div class="cutscene__name">追放された人はいませんでした</div>
        <div class="cutscene__desc">全員が投票をスキップしたため追放なし</div>
      </div>`;

  // 初日の夜明け（平和な朝）
  if (isNight0) {
    const html = `
      <div class="cutscene-morning">
        <div class="cutscene-sunrise">
          <div class="cutscene-sun"></div>
          <div class="cutscene-rays"></div>
        </div>
        <div class="cutscene__content">
          <div class="cutscene__title">☀️ ${turn}ターン目の朝</div>
          <p class="cutscene__sub">朝日が昇り、最初の朝を迎えました</p>
          <div class="cutscene__card cutscene__card--peace">
            <div class="cutscene__badge cutscene__badge--green">🕊️ 平穏な朝</div>
            <div class="cutscene__name">初日の夜は誰も襲われませんでした</div>
          </div>
        </div>
        <button type="button" class="btn btn--sm btn--ghost cutscene__skip">スキップ ⏩</button>
      </div>
    `;
    mountCutscene(html, 3800, onDone);
    return;
  }

  // 2ターン目以降（日の出＋追放発表[同票時はルーレット] ➔ 狼の襲撃ムービー or 騎士の盾防御）
  const hasWolfScene = victims.length > 0 || guardedSuccess;
  const sunriseDuration = isTieRoulette ? 4900 : 2600;
  const totalDuration = hasWolfScene ? sunriseDuration + 5600 : sunriseDuration + 1900;

  const attackResultCard = guardedSuccess && !victims.length
    ? `<div class="cutscene__card cutscene__card--shield">
        <div class="cutscene__badge cutscene__badge--green">🛡️ ナイトの護衛成功！</div>
        <div class="cutscene__highlight">騎士の盾が人狼の牙を完全に防いだ！</div>
        <div class="cutscene__name" style="color:var(--green);font-size:20px">誰も襲われませんでした！</div>
      </div>`
    : victims.length
    ? `<div class="cutscene__card cutscene__card--slash">
        <div class="cutscene__badge cutscene__badge--red">🐺 人狼の夜襲！</div>
        <div class="cutscene__person">
          <div class="cutscene__avatar-row">${victims.map((u) => avImg(u, 72)).join("")}</div>
          <div class="cutscene__name cutscene__name--blood">${victims.map((u) => esc(nameOf(u))).join("・")}</div>
        </div>
        <div class="cutscene__desc">鋭い爪に引き裂かれ、無残な姿で発見されました…</div>
      </div>`
    : `<div class="cutscene__card cutscene__card--peace">
        <div class="cutscene__badge cutscene__badge--green">🕊️ 夜襲なし</div>
        <div class="cutscene__name">昨晩の夜襲による犠牲者はいませんでした</div>
      </div>`;

  const html = `
    <div class="cutscene-morning">
      <!-- ステージ1：朝日が昇るシーン＋追放者発表 -->
      <div class="cutscene-stage cutscene-stage--sunrise" id="csSunriseStage">
        <div class="cutscene-sunrise">
          <div class="cutscene-sun"></div>
          <div class="cutscene-rays"></div>
        </div>
        <div class="cutscene__content">
          <div class="cutscene__title">☀️ ${turn}ターン目の朝</div>
          <p class="cutscene__sub">朝日が昇り、昨晩の出来事が明らかになります…</p>
          ${exiledHtml}
        </div>
      </div>

      <!-- ステージ2：人狼の夜襲ムービー（前半共通 ➔ 切り裂き or 騎士の盾カットイン） -->
      <div class="cutscene-stage cutscene-stage--wolf" id="csWolfStage" hidden>
        <video class="cutscene__video" id="csWolfVideo" src="movies/morning_attack.mp4" preload="auto" playsinline></video>
        <div class="cutscene__vignette"></div>

        <!-- ナイト護衛成功時の聖なる盾カットインエフェクト（飛びかかった瞬間に発動） -->
        <div class="cutscene__shield-intervene" id="csShieldIntervene" hidden>
          <div class="shield-flash"></div>
          <div class="shield-barrier">
            <div class="shield-ring shield-ring--1"></div>
            <div class="shield-ring shield-ring--2"></div>
            <svg class="shield-emblem" viewBox="0 0 120 140" width="130" height="150" aria-hidden="true">
              <defs>
                <linearGradient id="shGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stop-color="#e0f2fe"/>
                  <stop offset="45%" stop-color="#38bdf8"/>
                  <stop offset="100%" stop-color="#1d4ed8"/>
                </linearGradient>
                <linearGradient id="shRim" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#fef08a"/>
                  <stop offset="100%" stop-color="#d97706"/>
                </linearGradient>
              </defs>
              <path d="M60 8 L108 26 V66 C108 100 86 122 60 134 C34 122 12 100 12 66 V26 Z" fill="url(#shGrad)" stroke="url(#shRim)" stroke-width="6"/>
              <path d="M60 22 L95 36 V65 C95 91 78 109 60 119 C42 109 25 91 25 65 V36 Z" fill="none" stroke="#fff" stroke-opacity="0.6" stroke-width="2"/>
              <path d="M60 28 V112 M34 64 H86" stroke="#fef08a" stroke-width="6" stroke-linecap="round"/>
            </svg>
          </div>
        </div>

        <!-- 結果発表カード（爪で切り裂いた直後 or 盾で弾いた直後に下部に登場） -->
        <div class="cutscene__bottom-card" id="csAttackCard" hidden>
          ${attackResultCard}
        </div>
      </div>

      <button type="button" class="btn btn--sm btn--ghost cutscene__skip">スキップ ⏩</button>
    </div>
  `;

  const mounted = mountCutscene(html, totalDuration, onDone);
  if (!mounted) return;

  const { overlay } = mounted;

  // 同票ルーレット演出：高速回転から徐々に減速して追放者でピタッと止まる
  if (isTieRoulette) {
    const rCard = overlay.querySelector("#csRouletteCard");
    const rBadge = overlay.querySelector("#csRouletteBadge");
    const rPool = overlay.querySelector("#csRoulettePool");
    const rWheel = overlay.querySelector("#csRouletteWheel");
    const rAvatar = overlay.querySelector("#csRouletteAvatar");
    const rName = overlay.querySelector("#csRouletteName");
    const rDesc = overlay.querySelector("#csRouletteDesc");
    const cands = [...rPool.querySelectorAll(".roulette-cand")];

    const winnerUid = exiled[0];
    const winnerIdx = Math.max(0, tieCandidates.indexOf(winnerUid));
    const totalSteps = 16;
    // 最終ステップで必ず winnerIdx に着地するよう逆算
    const startIdx = (winnerIdx - (totalSteps % tieCandidates.length) + tieCandidates.length * 10) % tieCandidates.length;
    const intervals = [75, 80, 85, 95, 105, 115, 130, 145, 165, 190, 220, 260, 310, 370, 440, 520];

    let elapsed = 200;
    intervals.forEach((dt, step) => {
      elapsed += dt;
      const isFinal = step === intervals.length - 1;
      const idx = (startIdx + step + 1) % tieCandidates.length;
      const uid = tieCandidates[idx];
      addTimer(() => {
        cands.forEach((el, i) => el.classList.toggle("is-active", i === idx));
        if (rAvatar) rAvatar.src = avatarOf(uid);
        if (rName) rName.textContent = exiled.length > 1 && isFinal ? exiled.map((u) => nameOf(u)).join("・") : nameOf(uid);
        if (rWheel) rWheel.style.setProperty("--rot", `${(step + 1) * 65}deg`);
        playRouletteSound(isFinal);

        if (isFinal) {
          rCard?.classList.add("is-decided");
          if (rBadge) {
            rBadge.className = "cutscene__badge cutscene__badge--red";
            rBadge.textContent = "⚖️ ルーレット決着！追放者決定";
          }
          if (rDesc) rDesc.textContent = "ルーレットの結果、村から追放されました！";
        }
      }, elapsed);
    });
  }

  if (!hasWolfScene) return;

  const sunriseStage = overlay.querySelector("#csSunriseStage");
  const wolfStage = overlay.querySelector("#csWolfStage");
  const wolfVideo = overlay.querySelector("#csWolfVideo");
  const shieldEl = overlay.querySelector("#csShieldIntervene");
  const attackCard = overlay.querySelector("#csAttackCard");

  // 日の出＆追放発表（ルーレット時は4.9秒後、通常時は2.6秒後）から「人狼の夜襲ムービー」へ切り替え！
  addTimer(() => {
    if (sunriseStage) sunriseStage.hidden = true;
    if (wolfStage) wolfStage.hidden = false;
    safePlayVideo(wolfVideo);

    if (guardedSuccess && !victims.length) {
      // 前半（0.0s〜2.15s）はオオカミが唸って飛びかかる映像をそのまま見せ、
      // 爪で切り裂く直前（2.15秒目）に騎士の盾がガキン！と割り込んで防ぐ！
      addTimer(() => {
        try { wolfVideo?.pause(); } catch { /* ignore */ }
        wolfStage?.classList.add("is-shield-blocked");
        if (shieldEl) shieldEl.hidden = false;
        playShieldClangSound();
      }, 2150);

      addTimer(() => {
        if (attackCard) attackCard.hidden = false;
      }, 2600);
    } else {
      // 夜襲成功時：オオカミが爪で画面を切り裂いた瞬間（2.65秒目）に画面が揺れて犠牲者カードが出現！
      addTimer(() => {
        wolfStage?.classList.add("is-slashed");
        if (attackCard) attackCard.hidden = false;
      }, 2650);
    }
  }, sunriseDuration);
}

/**
 * 🗣️ 昼のカットシーン（`movies/day_gather.mp4` を全画面再生）
 * 「村のみんなが広場に集まってきている演出」
 */
export function playDayCutscene(turn, onDone) {
  const allPlayers = Object.keys(S.players || {}).filter((u) => S.players[u]?.alive !== false);
  const displayPlayers = (allPlayers.length ? allPlayers : Object.keys(S.players || {})).slice(0, 8);

  const html = `
    <div class="cutscene-video-wrap">
      <video class="cutscene__video" id="csDayVideo" src="movies/day_gather.mp4" preload="auto" playsinline muted></video>
      <div class="cutscene__vignette cutscene__vignette--day"></div>

      <div class="cutscene__overlay-bottom">
        <div class="cutscene__badge cutscene__badge--cyan">☀️ TURN ${turn} — DAY DISCUSSION</div>
        <h2 class="cutscene__title">🗣️ 昼のターン：議論開始</h2>
        ${displayPlayers.length ? `
          <div class="cutscene__crowd">
            ${displayPlayers.map((u, i) => `
              <div class="cutscene__gather-player" style="--d:${(i * 0.1).toFixed(2)}s">
                ${avImg(u, 38)}
              </div>
            `).join("")}
          </div>
        ` : ""}
        <p class="cutscene__sub">村人たちが広場に集まってきました。<br>人狼は誰なのか、話し合いを始めましょう！</p>
      </div>

      <button type="button" class="btn btn--sm btn--ghost cutscene__skip">スキップ ⏩</button>
    </div>
  `;

  const mounted = mountCutscene(html, 5000, onDone);
  if (!mounted) return;
  const video = mounted.overlay.querySelector("#csDayVideo");
  // 昼の動画には英語セリフが入っているため、雰囲気に合うようミュート再生
  safePlayVideo(video, { muteVoice: true });
}

/**
 * 🐺 夜のカットシーン（`movies/night_howl.mp4` を全画面再生）
 * 「日が暮れて満月が昇り、オオカミが遠吠えする演出」
 */
export function playNightCutscene(turn, isFirstNight, onDone) {
  const html = `
    <div class="cutscene-video-wrap">
      <video class="cutscene__video" id="csNightVideo" src="movies/night_howl.mp4" preload="auto" playsinline></video>
      <div class="cutscene__vignette cutscene__vignette--night"></div>

      <div class="cutscene__overlay-bottom">
        <div class="cutscene__badge cutscene__badge--red">🌙 ${isFirstNight ? "FIRST NIGHT" : `TURN ${turn} — NIGHT`}</div>
        <h2 class="cutscene__title cutscene__title--blood">🐺 ${isFirstNight ? "初日の夜" : "夜のターン"}</h2>
        <p class="cutscene__sub">日が暮れてあたりは闇に包まれ、<br>遠くからオオカミの遠吠えが響き渡ります…</p>
      </div>

      <button type="button" class="btn btn--sm btn--ghost cutscene__skip">スキップ ⏩</button>
    </div>
  `;

  const mounted = mountCutscene(html, 5000, onDone);
  if (!mounted) return;
  const video = mounted.overlay.querySelector("#csNightVideo");
  safePlayVideo(video);
}
