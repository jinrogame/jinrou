// アプリ起動・Firestore購読・イベント配線
import { S, isHost } from "./state.js";
import * as fb from "./firebase.js";
import * as Room from "./room.js";
import * as Host from "./host.js";
import * as UI from "./ui.js";

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
  if (S.room?.status === "waiting") await Room.leaveLobby();
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
boot();
