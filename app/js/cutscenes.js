// ターン開始・切り替わり時のフルスクリーン演出（朝・昼・夜）
import { S, nameOf, avatarOf } from "./state.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const avImg = (uid, size = 72) => `<img class="cutscene__avatar" src="${avatarOf(uid)}" alt="" width="${size}" height="${size}">`;

let activeOverlay = null;
let activeTimer = null;

export function clearCutscene() {
  if (activeTimer) { clearTimeout(activeTimer); activeTimer = null; }
  if (activeOverlay) {
    activeOverlay.remove();
    activeOverlay = null;
  }
}

function mountCutscene(html, durationMs, onDone) {
  clearCutscene();
  const phone = document.getElementById("phone");
  if (!phone) return;

  const overlay = document.createElement("div");
  overlay.className = "cutscene";
  overlay.innerHTML = html;

  const skipBtn = overlay.querySelector(".cutscene__skip");
  const finish = () => {
    overlay.classList.add("is-leaving");
    setTimeout(() => {
      clearCutscene();
      onDone?.();
    }, 400);
  };

  if (skipBtn) {
    skipBtn.addEventListener("click", finish);
  }
  // 画面タップでもスキップ可能
  overlay.addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    finish();
  });

  phone.appendChild(overlay);
  activeOverlay = overlay;
  activeTimer = setTimeout(finish, durationMs);
}

/**
 * 朝のカットシーン
 * 1. 朝日が昇る演出（空が白み、太陽が昇る）
 * 2. 追放発表（昨晩投票で追放された人）
 * 3. ナイト護衛 or 狼の爪切り裂き演出（夜襲された人の発表 / 護衛成功の盾発表）
 */
export function playMorningCutscene(report, turn, onDone) {
  const exiled = report?.exiled || [];
  const victims = report?.victims || [];
  const isNight0 = turn === 1 && !exiled.length && !victims.length;
  const guardedSuccess = !!report?.guardedSuccess;

  // 追放者のHTML
  const exiledHtml = exiled.length
    ? `<div class="cutscene__card cutscene__card--exile">
        <div class="cutscene__badge cutscene__badge--red">⚖️ 昨晩の追放</div>
        <div class="cutscene__person">
          ${exiled.map(u => avImg(u, 76)).join("")}
          <div class="cutscene__name">${exiled.map(u => esc(nameOf(u))).join("・")}</div>
        </div>
        <div class="cutscene__desc">村人の投票により追放されました</div>
      </div>`
    : `<div class="cutscene__card cutscene__card--safe">
        <div class="cutscene__badge cutscene__badge--cyan">⚖️ 昨晩の追放</div>
        <div class="cutscene__name">追放者なし</div>
      </div>`;

  // 夜襲 / 護衛のHTML
  let attackHtml = "";
  if (isNight0) {
    attackHtml = `
      <div class="cutscene__card cutscene__card--peace">
        <div class="cutscene__badge cutscene__badge--green">🕊️ 平穏な夜</div>
        <div class="cutscene__name">初日の夜は誰も襲われませんでした</div>
      </div>
    `;
  } else if (guardedSuccess && !victims.length) {
    // 騎士が守り切った演出！
    attackHtml = `
      <div class="cutscene__card cutscene__card--shield">
        <div class="cutscene__shield-fx">
          <div class="cutscene__shield-icon">🛡️</div>
          <div class="cutscene__shield-sparkle"></div>
        </div>
        <div class="cutscene__badge cutscene__badge--green">🛡️ ナイトの護衛成功！</div>
        <div class="cutscene__highlight">鉄壁の盾が人狼の夜襲を防いだ！</div>
        <div class="cutscene__name" style="color:var(--green)">誰も襲われませんでした！</div>
      </div>
    `;
  } else if (victims.length) {
    // 爪で切り裂く演出！
    attackHtml = `
      <div class="cutscene__card cutscene__card--slash">
        <div class="cutscene__slash-fx">
          <span class="claw claw--1"></span>
          <span class="claw claw--2"></span>
          <span class="claw claw--3"></span>
        </div>
        <div class="cutscene__badge cutscene__badge--red">🐺 人狼の夜襲！</div>
        <div class="cutscene__person">
          ${victims.map(u => avImg(u, 76)).join("")}
          <div class="cutscene__name cutscene__name--blood">${victims.map(u => esc(nameOf(u))).join("・")}</div>
        </div>
        <div class="cutscene__desc">鋭い爪の犠牲となりました…</div>
      </div>
    `;
  } else {
    attackHtml = `
      <div class="cutscene__card cutscene__card--peace">
        <div class="cutscene__badge cutscene__badge--green">🕊️ 犠牲者なし</div>
        <div class="cutscene__name">昨晩の犠牲者はいませんでした</div>
      </div>
    `;
  }

  const html = `
    <div class="cutscene-morning">
      <!-- 朝日の昇る背景アニメーション -->
      <div class="cutscene-sunrise">
        <div class="cutscene-sun"></div>
        <div class="cutscene-rays"></div>
      </div>

      <div class="cutscene__content">
        <div class="cutscene__step cutscene__step--sunrise">
          <div class="cutscene__title">☀️ ${turn}ターン目の朝が来ました</div>
          <p class="cutscene__sub">朝日が村を照らし出します…</p>
        </div>

        <div class="cutscene__step cutscene__step--exile">
          ${exiledHtml}
        </div>

        <div class="cutscene__step cutscene__step--attack">
          ${attackHtml}
        </div>
      </div>

      <button type="button" class="btn btn--sm btn--ghost cutscene__skip">スキップ ⏩</button>
    </div>
  `;

  // 朝は演出がリッチなため約6.5秒（タップで即スキップ可能）
  mountCutscene(html, 6500, onDone);
}

/**
 * 昼のカットシーン
 * 「村のみんなが集まってきているような演出」
 */
export function playDayCutscene(turn, onDone) {
  const allPlayers = Object.keys(S.players || {});
  const displayPlayers = allPlayers.slice(0, 8);

  const html = `
    <div class="cutscene-day">
      <div class="cutscene-day__sky">
        <div class="cutscene-cloud cloud--1"></div>
        <div class="cutscene-cloud cloud--2"></div>
      </div>

      <div class="cutscene__content">
        <div class="cutscene__icon-burst">🗣️💬📢</div>
        <h2 class="cutscene__title">☀️ 昼の話し合いタイム</h2>
        <div class="cutscene__crowd">
          ${displayPlayers.map((u, i) => `
            <div class="cutscene__gather-player" style="--d:${(i * 0.12).toFixed(2)}s">
              ${avImg(u, 44)}
            </div>
          `).join("")}
        </div>
        <p class="cutscene__sub">村人たちが広場に集まってきました。<br>人狼は誰なのか、議論を始めましょう！</p>
      </div>

      <button type="button" class="btn btn--sm btn--ghost cutscene__skip">スキップ ⏩</button>
    </div>
  `;

  mountCutscene(html, 3200, onDone);
}

/**
 * 夜のカットシーン
 * 「日が暮れてオオカミが鳴いているような演出」
 */
export function playNightCutscene(turn, isFirstNight, onDone) {
  const html = `
    <div class="cutscene-night">
      <div class="cutscene-night__moon">
        <div class="moon-body"></div>
        <div class="fog-layer"></div>
      </div>

      <div class="cutscene__content">
        <div class="cutscene__wolf-silhouette">
          <div class="wolf-icon">🐺</div>
          <div class="howl-ring ring-1"></div>
          <div class="howl-ring ring-2"></div>
          <div class="howl-ring ring-3"></div>
        </div>
        <h2 class="cutscene__title cutscene__title--blood">🌙 ${isFirstNight ? "初日の夜" : "夜のターン"}</h2>
        <div class="cutscene__howl-text">「ワオォォォン…！」</div>
        <p class="cutscene__sub">日が暮れてあたりは闇に包まれ、<br>遠くからオオカミの遠吠えが響き渡ります…</p>
      </div>

      <button type="button" class="btn btn--sm btn--ghost cutscene__skip">スキップ ⏩</button>
    </div>
  `;

  mountCutscene(html, 3400, onDone);
}
