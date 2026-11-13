// アプリ起動・Firestore購読・イベント配線
import { S, isHost } from "./state.js";
import * as fb from "./firebase.js";
import * as Room from "./room.js";
import * as Host from "./host.js";
import * as UI from "./ui.js";
import { playMorningCutscene, playDayCutscene, playNightCutscene } from "./cutscenes.js";

let unsubs = [];
let hostSubscribed = false;
let raf = 0;
const schedule = () => {
  if (raf) return;
  raf = requestAnimationFrame(() => { raf = 0; UI.render(); UI.tickUI(); });
};

function unsubscribeAll() {
  unsubs.forEach((u) => u());
  unsubs = [];
}

function resetState() {
  Object.assign(S, { roomId: null, room: null, players: {}, secret: null, secrets: {}, actions: {}, myAction: {}, forcedSeq: -1 });
  hostSubscribed = false;
}

function leaveToTitle(message) {
  unsubscribeAll();
  resetState();
  Room.clearSession();
  UI.resetView();
  history.replaceState(null, "", location.pathname + (fb.DEV ? "?dev=1" : ""));
  schedule();
  if (message) alert(message);
}

function subscribeHost(roomId) {
  hostSubscribed = true;
  unsubs.push(fb.onSnapshot(fb.secretsCol(roomId), (snap) => {
    S.secrets = {};
    snap.forEach((d) => { S.secrets[d.id] = d.data(); });
    S.secret = S.secrets[S.uid] ?? null;
    schedule(); Host.onState();
  }, console.error));
  unsubs.push(fb.onSnapshot(fb.actionsCol(roomId), (snap) => {
    S.actions = {};
    snap.forEach((d) => { S.actions[d.id] = d.data(); });
    Host.onState();
  }, console.error));
}

function subscribe(roomId) {
  unsubscribeAll();
  resetState();
  S.roomId = roomId;
  Room.saveSession(roomId);
  UI.resetView();
  schedule();
  unsubs.push(fb.onSnapshot(fb.roomRef(roomId), (snap) => {
    if (!snap.exists()) { leaveToTitle("ルームが解散されました"); return; }
    S.room = snap.data();
    if (isHost() && !hostSubscribed) subscribeHost(roomId);
    schedule(); Host.onState();
  }, (e) => UI.fatal("ルーム情報を取得できません: " + e.message)));
  unsubs.push(fb.onSnapshot(fb.playersCol(roomId), (snap) => {
    S.players = {};
    snap.forEach((d) => { S.players[d.id] = d.data(); });
    schedule(); Host.onState();
  }, console.error));
  unsubs.push(fb.onSnapshot(fb.secretRef(roomId, S.uid), (snap) => {
    if (isHost() && hostSubscribed) return; // オーナーは全員分のコレクション購読を使用
    S.secret = snap.exists() ? snap.data() : null;
    schedule();
  }, console.error));
}

window.addEventListener("jinrou:enter", (e) => subscribe(e.detail));
window.addEventListener("jinrou:leave", async () => {
  await Room.leaveRoom();
  leaveToTitle();
});

async function boot() {
  UI.bootScreen("接続中…");
  try {
    S.uid = await fb.signIn();
  } catch (e) {
    const notAllowed = e.code === "auth/operation-not-allowed" || e.code === "auth/admin-restricted-operation";
    UI.fatal(
      (notAllowed ? "匿名ログインが許可されていません。" : "Firebase に接続できません。") + ` [${e.code || "unknown"}] ${e.message || e}`,
      notAllowed ? `<a class="btn btn--cyan btn--sm" style="text-decoration:none;display:flex;align-items:center;justify-content:center" target="_blank" rel="noopener" href="https://console.firebase.google.com/project/jinrou-game-335ae/authentication/providers">設定画面を開く（匿名を有効にする）</a>` : "",
    );
    return;
  }
  const saved = Room.loadSession();
  if (saved?.roomId) {
    try {
      const mine = await fb.getDoc(fb.playerRef(saved.roomId, S.uid));
      if (mine.exists() && (await fb.getDoc(fb.roomRef(saved.roomId))).exists()) { subscribe(saved.roomId); return; }
    } catch (e) { console.warn(e); }
    Room.clearSession();
  }
  UI.resetView();
  UI.render();
}

setInterval(() => UI.tickUI(), 250);
setInterval(() => Host.onState(), 500);

// 演出テストボタンの配線（スマホ画面上部のテストバーからワンクリック再生）
function ensureDummyPlayers() {
  const names = ["たろう", "はなこ", "じろう", "さぶろう", "しろう", "ごろう"];
  names.forEach((name, i) => {
    const id = `test_${i + 1}`;
    if (!S.players[id]) S.players[id] = { name, avatarId: String(i + 1), alive: true };
  });
}

document.getElementById("btnTestMorningRoulette2")?.addEventListener("click", () => {
  ensureDummyPlayers();
  playMorningCutscene({
    exiled: ["test_2"],
    tieCandidates: ["test_1", "test_2"],
    victims: ["test_3"],
    guardedSuccess: false,
  }, 2);
});

document.getElementById("btnTestMorningRoulette3")?.addEventListener("click", () => {
  ensureDummyPlayers();
  playMorningCutscene({
    exiled: ["test_3"],
    tieCandidates: ["test_1", "test_2", "test_3"],
    victims: [],
    guardedSuccess: true,
  }, 2);
});

document.getElementById("btnTestMorningKill")?.addEventListener("click", () => {
  ensureDummyPlayers();
  const dummyReport = {
    exiled: [S.uid || "test_1"],
    victims: ["test_2"],
    guardedSuccess: false,
  };
  if (S.uid && !S.players[S.uid]) S.players[S.uid] = { name: "たろう", avatarId: "1" };
  playMorningCutscene(dummyReport, 2);
});

document.getElementById("btnTestMorningShield")?.addEventListener("click", () => {
  ensureDummyPlayers();
  const dummyReport = {
    exiled: ["test_3"],
    victims: [],
    guardedSuccess: true,
  };
  playMorningCutscene(dummyReport, 2);
});

document.getElementById("btnTestDay")?.addEventListener("click", () => {
  ensureDummyPlayers();
  playDayCutscene(2);
});

document.getElementById("btnTestNight")?.addEventListener("click", () => {
  playNightCutscene(2, false);
});

boot();
