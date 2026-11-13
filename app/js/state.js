// アプリ全体の共有状態
export const S = {
  uid: null,
  roomId: null,
  room: null,        // rooms/{id}
  players: {},       // uid -> player data
  secret: null,      // 自分の secrets/{uid}
  secrets: {},       // (オーナーのみ) 全員の secrets
  actions: {},       // (オーナーのみ) 全員の actions
  myAction: {},      // 自分が今フェーズで送ったアクション {seq, ...}
  forcedSeq: -1,     // オーナーが「強制進行」したフェーズseq
};

export const isHost = () => !!S.room && S.room.hostUid === S.uid;
export const me = () => S.players[S.uid];
export const playerList = () => Object.entries(S.players).map(([uid, p]) => ({ uid, ...p }));
export const aliveList = () => playerList().filter((p) => p.alive);
export const nameOf = (uid) => S.players[uid]?.name ?? "？";
export const avatarOf = (uid) => {
  const p = S.players[uid];
  if (!p) return "img/avatar_01.svg";
  return p.avatarDataUrl || `img/avatar_${String(((Number(p.avatarId) || 1) - 1) % 10 + 1).padStart(2, "0")}.svg`;
};
/** ロビー表示順: オーナー先頭 → uid順 */
export const sortedPlayers = () => {
  const hostUid = S.room?.hostUid;
  return playerList().sort((a, b) => (a.uid === hostUid ? -1 : b.uid === hostUid ? 1 : a.uid < b.uid ? -1 : 1));
};
