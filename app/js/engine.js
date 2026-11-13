// 純粋ロジック（DOM/Firebase非依存）：役職配布・判定・夜間解決・ミニゲーム評価
import { ROLES, PREFECTURES } from "./data.js";

export const shuffle = (arr, rng = Math.random) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
export const pickOne = (arr, rng = Math.random) => arr[Math.floor(rng() * arr.length)];
export const teamOf = (role) => ROLES[role]?.team ?? "citizen";
export const isWolfTeam = (role) => teamOf(role) === "wolf";

/** 配役の枚数を計算 */
export function roleCounts(config, playerCount) {
  const wolf = ["wolf_god", "werewolf", "madman", "psycho"].reduce((a, k) => a + (Number(config[k]) || 0), 0);
  const special =
    ["seer", "medium", "knight", "cosplayer", "doctor"].reduce((a, k) => a + (config[k] ? 1 : 0), 0) + (config.lovers ? 2 : 0);
  return { wolf, special, auto: playerCount - wolf - special };
}

/** 役職をランダム配布。戻り値: { uid: { role, team, partner? } } */
export function assignRoles(uids, config, rng = Math.random) {
  const list = [];
  ["wolf_god", "werewolf", "madman", "psycho"].forEach((k) => { for (let i = 0; i < (Number(config[k]) || 0); i++) list.push(k); });
  ["seer", "medium", "knight", "cosplayer", "doctor"].forEach((k) => { if (config[k]) list.push(k); });
  if (config.lovers) list.push("lovers", "lovers");
  if (list.length > uids.length) throw new Error("配役が参加人数を超えています");
  while (list.length < uids.length) list.push("citizen");
  const roles = shuffle(list, rng);
  const out = {};
  shuffle(uids, rng).forEach((uid, i) => { out[uid] = { role: roles[i], team: teamOf(roles[i]) }; });
  const lv = Object.keys(out).filter((u) => out[u].role === "lovers");
  if (lv.length === 2) { out[lv[0]].partner = lv[1]; out[lv[1]].partner = lv[0]; }
  return out;
}

/** 占い判定: コスプレイヤーは人狼（黒）扱い。サイコ・狂人は人間（白） */
export const judgeSeer = (role) => (role === "wolf_god" || role === "werewolf" || role === "cosplayer" ? "wolf" : "human");
/** 霊媒判定: コスプレイヤーは人間 */
export const judgeMedium = (role) => (role === "wolf_god" || role === "werewolf" ? "wolf" : "human");

/** 多数決。同票はランダム。上位n人のuidと、同票決着になった場合の候補一覧(tieCandidates)を返す */
export function tallyTopWithTie(votes, n = 1, rng = Math.random) {
  const cnt = new Map();
  votes.filter((v) => v && v !== "__skip__").forEach((v) => cnt.set(v, (cnt.get(v) || 0) + 1));
  const groups = new Map();
  cnt.forEach((c, u) => { if (!groups.has(c)) groups.set(c, []); groups.get(c).push(u); });
  const selected = [];
  let tieCandidates = [];
  const sortedCounts = [...groups.keys()].sort((a, b) => b - a);
  for (const c of sortedCounts) {
    if (selected.length >= n) break;
    const grp = groups.get(c);
    const remain = n - selected.length;
    if (grp.length <= remain) {
      shuffle(grp, rng).forEach((u) => selected.push(u));
    } else {
      tieCandidates = [...grp];
      shuffle(grp, rng).slice(0, remain).forEach((u) => selected.push(u));
    }
  }
  return { selected, tieCandidates };
}

/** 多数決。同票はランダム。上位n人のuidを返す */
export function tallyTop(votes, n = 1, rng = Math.random) {
  return tallyTopWithTie(votes, n, rng).selected;
}

/** その夜に使えるスキル */
export function capabilities(role, effects = {}, ctx = {}) {
  const team = teamOf(role);
  return {
    seer: role === "seer" || !!effects.allSeer,
    medium: role === "medium",
    guard: role === "knight" || role === "cosplayer" || (!!effects.allKnight && team === "citizen"),
    attack: role === "wolf_god" || role === "werewolf",
    doctor: role === "doctor" && !ctx.doctorUsed,
  };
}

/** 勝敗判定（即時決着のみ）。null=継続 */
export function checkWin(aliveRoles) {
  const w = aliveRoles.filter(isWolfTeam).length;
  const c = aliveRoles.length - w;
  if (w === 0 && c === 0) return "draw";
  if (w === 0) return "citizen";
  if (c === 0) return "wolf";
  return null;
}
/** 最大ターン終了時の判定 */
export function finalWin(aliveRoles) {
  const w = aliveRoles.filter(isWolfTeam).length;
  const c = aliveRoles.length - w;
  return w === c ? "draw" : c > w ? "citizen" : "wolf";
}

/**
 * 夜間一括判定
 * ctx: { roles:{uid:role}, alive:{uid:bool}, pendingExile:[uid], actions:{uid:{seerTarget,guardTarget,attackTarget,reviveTarget}},
 *        effects:{allKnight,allSeer,noAttack,extraAttack,reviveVoteTarget}, doctorUsed:{uid:bool}, night0:bool, rng }
 */
export function resolveNight(ctx) {
  const rng = ctx.rng || Math.random;
  const roles = ctx.roles;
  const alive = { ...ctx.alive };
  const effects = ctx.effects || {};
  const actions = ctx.actions || {};
  const log = { exiled: [], attacked: [], retaliated: [], follow: [], revived: [], doctorUsed: null };
  const diedTonight = new Set();
  const kill = (u) => { if (alive[u]) { alive[u] = false; diedTonight.add(u); return true; } return false; };
  const act = (u) => actions[u] || {};

  // 1. 追放確定
  const exiledSet = new Set();
  (ctx.pendingExile || []).forEach((u) => { if (kill(u)) { exiledSet.add(u); log.exiled.push(u); } });

  // 2. 報酬「脱落者復活」
  const rv = effects.reviveVoteTarget;
  if (rv && alive[rv] === false && !exiledSet.has(rv)) { alive[rv] = true; diedTonight.delete(rv); log.revived.push(rv); }

  const actors = Object.keys(roles).filter((u) => alive[u] && !exiledSet.has(u));
  const capOf = (u) => capabilities(roles[u], effects, { doctorUsed: ctx.doctorUsed?.[u] });
  const psychoAlive = (u) => roles[u] === "psycho" && alive[u];

  // 3. サイコキラーへの干渉（初日夜は無効）
  if (!ctx.night0) {
    actors.forEach((u) => {
      const a = act(u), cap = capOf(u);
      const hit = (cap.seer && a.seerTarget && psychoAlive(a.seerTarget)) || (cap.guard && a.guardTarget && psychoAlive(a.guardTarget));
      if (hit && kill(u)) log.retaliated.push(u);
    });
  }

  // 4. 護衛
  const guarded = new Set();
  actors.forEach((u) => { const a = act(u); if (capOf(u).guard && a.guardTarget && !ctx.night0) guarded.add(a.guardTarget); });

  // 5. 夜襲
  const attackedSet = new Set();
  let guardedSuccess = false;
  if (!ctx.night0 && !effects.noAttack) {
    const wolves = actors.filter((u) => capOf(u).attack);
    const validTarget = (t) => t && alive[t] && !(roles[t] === "wolf_god" || roles[t] === "werewolf");
    const votes = wolves.map((u) => ({ voter: u, t: act(u).attackTarget })).filter((v) => validTarget(v.t));
    const n = effects.extraAttack ? 2 : 1;
    const targets = tallyTop(votes.map((v) => v.t), n, rng);
    if (votes.length && targets.length < n) {
      const pool = Object.keys(roles).filter((u) => alive[u] && validTarget(u) && !targets.includes(u));
      while (targets.length < n && pool.length) targets.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    }
    targets.forEach((t) => {
      if (roles[t] === "psycho") {
        votes.filter((v) => v.t === t).forEach((v) => { if (kill(v.voter)) log.retaliated.push(v.voter); });
      } else if (guarded.has(t)) {
        guardedSuccess = true;
      } else if (kill(t)) {
        attackedSet.add(t);
        log.attacked.push(t);
      }
    });
  }

  // 6. 奇跡の医者
  if (!ctx.night0) {
    Object.keys(roles).forEach((u) => {
      if (roles[u] !== "doctor" || !alive[u] || exiledSet.has(u) || attackedSet.has(u)) return;
      if (ctx.doctorUsed?.[u]) return;
      const t = act(u).reviveTarget;
      if (!t || alive[t] !== false || diedTonight.has(t)) return;
      alive[t] = true;
      log.revived.push(t);
      log.doctorUsed = u;
      if (roles[t] === "psycho" && kill(u)) log.retaliated.push(u);
    });
  }

  // 7. 恋人の後追い（今夜死んだ人のみ対象）
  let changed = true;
  while (changed) {
    changed = false;
    [...diedTonight].forEach((u) => {
      if (roles[u] !== "lovers") return;
      const p = Object.keys(roles).find((x) => x !== u && roles[x] === "lovers");
      if (p && alive[p] && kill(p)) { log.follow.push(p); changed = true; }
    });
  }

  return { alive, log, guardedSuccess, win: checkWin(Object.keys(alive).filter((u) => alive[u]).map((u) => roles[u])) };
}

/* ---------------- ミニゲーム評価 ---------------- */
const kataToHira = (s) => s.replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
export function normalizeAnswer(text, kind = "kanji") {
  let s = String(text ?? "").normalize("NFKC").replace(/\s+/g, "");
  if (kind === "hira") s = kataToHira(s);
  return s;
}
export function findPref(text, kind) {
  const s = normalizeAnswer(text, kind);
  if (!s) return -1;
  return PREFECTURES.findIndex((p) => (kind === "hira" ? [p.h, p.h + p.sh] : [p.k, p.k + p.sk]).includes(s));
}

/** entries: [{uid, v}] v=undefined は未回答 */
export function evalTask(id, entries, ctx = {}) {
  const n = entries.length;
  const done = entries.filter((e) => e.v !== undefined && e.v !== null && e.v !== "");
  if (id === "mash") {
    const total = done.reduce((a, e) => a + Number(e.v), 0);
    return { success: total >= n * 100, summary: `${total} / ${n * 100}回`, contrib: entries.map((e) => ({ uid: e.uid, text: `${Number(e.v) || 0}回`, ok: (Number(e.v) || 0) >= 100, score: Number(e.v) || 0 })) };
  }
  if (id === "match" || id === "unique") {
    const norm = entries.map((e) => (e.v ? normalizeAnswer(e.v, ctx.kind) : ""));
    const all = norm.every(Boolean);
    const success = all && (id === "match" ? new Set(norm).size === 1 : new Set(norm).size === n);
    const cnt = {};
    norm.forEach((x) => { cnt[x] = (cnt[x] || 0) + 1; });
    const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0];
    return {
      success,
      summary: success ? "全員クリア" : "条件を満たせず",
      contrib: entries.map((e, i) => ({ uid: e.uid, text: e.v || "未回答", ok: !!norm[i] && (id === "match" ? norm[i] === top : cnt[norm[i]] === 1), score: norm[i] ? 1 : 0 })),
    };
  }
  if (id === "relay") {
    const success = entries.every((e) => e.v);
    return { success, summary: `${done.length} / ${n}人回答`, contrib: entries.map((e) => ({ uid: e.uid, text: e.v || "未回答", ok: !!e.v, score: e.v ? 1 : 0 })) };
  }
  if (id === "timer") {
    const ok = (v) => v !== undefined && v !== null && Math.abs(Number(v) - 10) <= 0.5;
    return { success: entries.every((e) => ok(e.v)), summary: "±0.5秒以内", contrib: entries.map((e) => ({ uid: e.uid, text: e.v === undefined || e.v === null ? "未挑戦" : `${Number(e.v).toFixed(2)}秒`, ok: ok(e.v), score: e.v == null ? 0 : 100 - Math.abs(Number(e.v) - 10) * 10 })) };
  }
  throw new Error("unknown task " + id);
}

export function generateRoomId(rng = Math.random) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 4 }, () => chars[Math.floor(rng() * chars.length)]).join("");
}
