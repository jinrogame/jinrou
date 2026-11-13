// ルーム作成・入室・退室・各プレイヤーの書き込み（クライアント側）
import { S } from "./state.js";
import * as fb from "./firebase.js";
import { DEFAULT_ROLE_CONFIG, MAX_PLAYERS } from "./data.js";
import { generateRoomId } from "./engine.js";

const SESSION_KEY = "jinrou.session";
export const saveSession = (roomId) => localStorage.setItem(SESSION_KEY, JSON.stringify({ roomId }));
export const loadSession = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } };
export const clearSession = () => localStorage.removeItem(SESSION_KEY);

async function addPlayer(roomId, { name, avatar }) {
  const data = { name: name.slice(0, 8), alive: true, readySeq: 0, avatarId: String(1 + Math.floor(Math.random() * 10)) };
  if (avatar) data.avatarDataUrl = avatar;
  await fb.setDoc(fb.playerRef(roomId, S.uid), data);
}

export async function createRoom({ name, avatar, maxTurns }) {
  let id = null;
  for (let i = 0; i < 10; i++) {
    const c = generateRoomId();
    if (!(await fb.getDoc(fb.roomRef(c))).exists()) { id = c; break; }
  }
  if (!id) throw new Error("ルームIDの発行に失敗しました。もう一度お試しください");
  await fb.setDoc(fb.roomRef(id), {
    roomId: id, hostUid: S.uid, status: "waiting", phase: "lobby", phaseSeq: 1, phaseEndsAt: null,
    turn: 0, maxTurns, roleConfig: { ...DEFAULT_ROLE_CONFIG }, usedTasks: [], usedEffects: [],
  });
  await addPlayer(id, { name, avatar });
  return id;
}

export async function joinRoom(roomId, { name, avatar }) {
  const snap = await fb.getDoc(fb.roomRef(roomId));
  if (!snap.exists()) throw new Error("そのルームIDは見つかりません");
  const mine = await fb.getDoc(fb.playerRef(roomId, S.uid));
  if (mine.exists()) return roomId; // 再接続
  if (snap.data().status !== "waiting") throw new Error("このルームはすでにゲーム中です");
  const cnt = (await fb.getDocs(fb.playersCol(roomId))).size;
  if (cnt >= MAX_PLAYERS) throw new Error(`満員です（最大${MAX_PLAYERS}人）`);
  await addPlayer(roomId, { name, avatar });
  return roomId;
}

/** ルームからの退室（オーナーの場合はルーム解散、ゲストのゲーム中退室は待機スキップ設定） */
export async function leaveRoom() {
  const id = S.roomId;
  if (!id) return;
  try {
    if (S.room?.hostUid === S.uid) {
      const ps = await fb.getDocs(fb.playersCol(id));
      const batch = fb.writeBatch(fb.db);
      ps.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      await fb.deleteDoc(fb.roomRef(id));
    } else if (S.room?.status === "waiting") {
      await fb.deleteDoc(fb.playerRef(id, S.uid));
    } else if (S.room?.status === "playing") {
      await fb.updateDoc(fb.playerRef(id, S.uid), { readySeq: 999999 });
    }
  } catch (e) { console.warn(e); }
}
export const leaveLobby = leaveRoom;

/** 「OK」ボタン：現在フェーズ準備完了 */
export async function markReady() {
  await fb.updateDoc(fb.playerRef(S.roomId, S.uid), { readySeq: S.room.phaseSeq });
}

/** 投票・スキルなど今フェーズのアクションを送信（フェーズseqごとに管理） */
export async function sendAction(patch) {
  const seq = S.room.phaseSeq;
  S.myAction = { ...(S.myAction.seq === seq ? S.myAction : { seq }), ...patch };
  await fb.setDoc(fb.actionRef(S.roomId, S.uid), S.myAction);
}

/** ミニゲームの成績送信 */
export async function sendTask(v, n) {
  await fb.updateDoc(fb.playerRef(S.roomId, S.uid), { taskSeq: S.room.phaseSeq, taskV: v, taskN: n });
}
