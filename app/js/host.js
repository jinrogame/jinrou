// オーナー端末で動く進行・判定エンジン（Host-Authoritative）
import { S, isHost, playerList, aliveList } from "./state.js";
import * as fb from "./firebase.js";
import { TASKS, EFFECTS, QUIZ_TOPICS, RELAY_TOPICS, TIME, MIN_PLAYERS } from "./data.js";
import {
  assignRoles, shuffle, pickOne, tallyTop, judgeSeer, judgeMedium, resolveNight, evalTask, findPref,
  finalWin, capabilities, roleCounts, isWolfTeam,
} from "./engine.js";

export const minPlayers = () => (fb.DEV ? 1 : MIN_PLAYERS);

/** 今ターンに発動中の報酬／罰フラグ */
export function flagsOf(room) {
  const e = room?.effectState;
  const f = (id) => !!(e && e.applied && e.id === id);
  return {
    allKnight: f("all_knight"), allSeer: f("all_seer"), revive: f("revive"), noAttack: f("no_attack"), wolfCount: f("wolf_count"),
    extraAttack: f("extra_attack"), seerOff: f("seer_off"), doubleExile: f("double_exile"),
  };
}

let actedSeq = -1;
let busy = false;
const handled = new Set();
const relayHandled = new Set();
const roomR = () => fb.roomRef(S.roomId);

async function setPhase(phase, extra = {}, sec = null) {
  const r = S.room;
  await fb.updateDoc(roomR(), { phase, phaseSeq: r.phaseSeq + 1, phaseEndsAt: sec ? Date.now() + sec * 1000 : null, ...extra });
}

/* ------------------------------ ロビー操作 ------------------------------ */
export const updateConfig = (partial) => fb.updateDoc(roomR(), { roleConfig: { ...S.room.roleConfig, ...partial } });
export const setMaxTurns = (n) => fb.updateDoc(roomR(), { maxTurns: Math.max(1, Math.min(10, n)) });

export function validateStart() {
  const n = playerList().length;
  const c = roleCounts(S.room.roleConfig, n);
  if (n < minPlayers()) return `あと${minPlayers() - n}人以上必要です（最少${minPlayers()}人）`;
  if (c.auto < 0) return "配役が参加人数を超えています";
  if (c.wolf < 1) return "人狼陣営を1人以上にしてください";
  return null;
}

export async function startGame() {
  const err = validateStart();
  if (err) throw new Error(err);
  const r = S.room;
  const uids = playerList().map((p) => p.uid);
  const assign = assignRoles(uids, r.roleConfig);
  const batch = fb.writeBatch(fb.db);
  uids.forEach((uid) => {
    const a = assign[uid];
    const s = { role: a.role, team: a.team, doctorUsed: false, inbox: null };
    if (a.partner) s.partner = a.partner;
    if (a.role === "wolf_god") s.allRoles = Object.fromEntries(uids.map((u) => [u, assign[u].role]));
    if (a.role === "wolf_god" || a.role === "werewolf") s.mates = uids.filter((u) => u !== uid && ["wolf_god", "werewolf"].includes(assign[u].role));
    batch.set(fb.secretRef(S.roomId, uid), s);
    batch.update(fb.playerRef(S.roomId, uid), { alive: true, readySeq: 0, taskSeq: 0 });
  });
  batch.update(roomR(), {
    status: "playing", phase: "role", phaseSeq: r.phaseSeq + 1, phaseEndsAt: null, turn: 0, order: shuffle(uids),
    usedTasks: [], usedEffects: [], currentTask: null, effectState: null, morningReport: null, ending: null, winner: null,
    finalRoles: null, pendingExile: [], reviveTarget: null, taskResult: null, relay: null,
  });
  actedSeq = -1;
  await batch.commit();
}

export async function resetToLobby() {
  const r = S.room;
  const batch = fb.writeBatch(fb.db);
  playerList().forEach((p) => batch.update(fb.playerRef(S.roomId, p.uid), { alive: true, readySeq: 0, taskSeq: 0 }));
  batch.update(roomR(), {
    status: "waiting", phase: "lobby", phaseSeq: r.phaseSeq + 1, phaseEndsAt: null, turn: 0, currentTask: null, effectState: null,
    morningReport: null, ending: null, winner: null, finalRoles: null, pendingExile: [], reviveTarget: null, taskResult: null, relay: null,
    usedTasks: [], usedEffects: [],
  });
  actedSeq = -1;
  await batch.commit();
}

/* ------------------------------ 進行ループ ------------------------------ */
export function force() {
  if (!S.room) return;
  S.forcedSeq = S.room.phaseSeq;
  onState();
}

export async function onState() {
  if (!isHost() || !S.room || busy) return;
  busy = true;
  try {
    await handleInbox();
    await evaluate();
  } catch (e) {
    console.error("[host]", e);
  } finally {
    busy = false;
  }
}

async function evaluate() {
  const r = S.room;
  if (r.status === "waiting" || r.phase === "finished" || r.phase === "lobby") return;
  const seq = r.phaseSeq;
  if (actedSeq === seq) return;
  const now = Date.now();
  const forced = S.forcedSeq === seq;
  const all = playerList();
  const alive = all.filter((p) => p.alive);
  const readyAll = (arr) => arr.every((p) => (p.readySeq || 0) >= seq);
  const expired = !!r.phaseEndsAt && now >= r.phaseEndsAt;
  const go = async (fn) => {
    actedSeq = seq;
    try { await fn(); } catch (e) { actedSeq = -1; console.error(e); }
  };
  switch (r.phase) {
    case "role": if (forced || readyAll(all)) await go(() => setPhase("intro", {}, TIME.intro)); break;
    case "intro": if (forced || readyAll(all)) await go(() => setPhase("night0", {}, TIME.skill)); break;
    case "night0":
      if (forced || expired || readyAll(alive)) {
        await go(() => setPhase("morning_report", { turn: 1, morningReport: { exiled: [], victims: [], revived: [] }, ending: null }));
      }
      break;
    case "morning_report": if (forced || readyAll(all)) await go(r.ending ? finish : startTaskAnnounce); break;
    case "task_announce": if (forced || readyAll(all)) await go(startTask); break;
    case "task_play": await playTick(r, seq, now, forced, alive, go); break;
    case "task_result": if (forced || readyAll(all)) await go(() => setPhase("day", {}, TIME.day)); break;
    case "day": if (forced || expired || readyAll(alive)) await go(() => setPhase("vote", {}, TIME.vote)); break;
    case "vote": if (forced || expired || readyAll(alive)) await go(resolveVote); break;
    case "revive_vote": if (forced || expired || readyAll(alive)) await go(resolveRevive); break;
    case "skill": if (forced || expired || readyAll(alive)) await go(resolveSkill); break;
    default: break;
  }
}

/* ------------------------------ 朝：タスク抽選 ------------------------------ */
async function startTaskAnnounce() {
  const r = S.room;
  let usedT = r.usedTasks || [];
  let poolT = TASKS.filter((t) => !usedT.includes(t.id));
  if (!poolT.length) { usedT = []; poolT = [...TASKS]; }
  const task = pickOne(poolT);
  let usedE = r.usedEffects || [];
  let poolE = EFFECTS.filter((e) => !usedE.includes(e.id));
  if (!poolE.length) { usedE = []; poolE = [...EFFECTS]; }
  const eff = pickOne(poolE);
  const topic = task.id === "relay" ? pickOne(RELAY_TOPICS) : task.id === "match" || task.id === "unique" ? pickOne(QUIZ_TOPICS) : null;
  const currentTask = { id: task.id, text: topic?.text ?? "", kind: topic?.kind ?? "", target: aliveList().length * 100 };
  await setPhase("task_announce", {
    usedTasks: [...usedT, task.id], usedEffects: [...usedE, eff.id], currentTask,
    effectState: { id: eff.id, type: eff.type, applied: false, wolfAlive: null }, taskResult: null,
  });
}

async function startTask() {
  const t = S.room.currentTask;
  const extra = {};
  let sec = TIME.quiz;
  if (t.id === "mash") sec = TIME.mash;
  if (t.id === "timer") sec = TIME.timer;
  if (t.id === "relay") {
    sec = TIME.relay;
    extra.relay = { order: shuffle(aliveList().map((p) => p.uid)), idx: 0, answers: [], lastN: {}, err: null };
  }
  await setPhase("task_play", extra, sec);
}

async function playTick(r, seq, now, forced, alive, go) {
  const t = r.currentTask;
  const ends = r.phaseEndsAt;
  const val = (p) => (p.taskSeq === seq ? p.taskV : undefined);
  const entries = () => alive.map((p) => ({ uid: p.uid, v: val(p) }));
  if (t.id === "mash") {
    if (forced || now >= ends + 1500) await go(() => finishTask(entries()));
  } else if (t.id === "relay") {
    const rel = r.relay;
    const cur = rel.order[rel.idx];
    const p = S.players[cur];
    const key = `${seq}:${cur}:${p?.taskN}`;
    if (rel.idx < rel.order.length && !forced && now < ends && p && p.taskSeq === seq && (p.taskN || 0) > (rel.lastN[cur] || 0) && !relayHandled.has(key)) {
      relayHandled.add(key);
      const text = String(p.taskV ?? "");
      const pref = findPref(text, t.kind);
      const lastN = { ...rel.lastN, [cur]: p.taskN };
      let next;
      if (pref < 0) next = { ...rel, lastN, err: { uid: cur, n: p.taskN, msg: "都道府県として認識できません" } };
      else if (rel.answers.some((a) => a.pref === pref)) next = { ...rel, lastN, err: { uid: cur, n: p.taskN, msg: "すでに出ています！" } };
      else next = { ...rel, lastN, err: null, idx: rel.idx + 1, answers: [...rel.answers, { uid: cur, text, pref }] };
      await fb.updateDoc(roomR(), { relay: next });
      return;
    }
    if (forced || now >= ends || rel.idx >= rel.order.length) {
      await go(() => finishTask(rel.order.map((uid) => ({ uid, v: rel.answers.find((a) => a.uid === uid)?.text }))));
    }
  } else if (forced || now >= ends || alive.every((p) => val(p) !== undefined)) {
    await go(() => finishTask(entries()));
  }
}

async function finishTask(entries) {
  const r = S.room;
  const t = r.currentTask;
  const res = evalTask(t.id, entries, { kind: t.kind });
  const eff = r.effectState;
  const applied = eff.type === "reward" ? res.success : !res.success;
  let wolfAlive = null;
  if (eff.id === "wolf_count" && applied) {
    wolfAlive = aliveList().filter((p) => isWolfTeam(S.secrets[p.uid]?.role)).length;
  }
  await setPhase("task_result", {
    taskResult: { success: res.success, summary: res.summary, contrib: res.contrib.map(({ uid, text, ok, score }) => ({ uid, text: String(text), ok, score })) },
    effectState: { ...eff, applied, wolfAlive },
  });
}

/* ------------------------------ 夜：投票・スキル ------------------------------ */
const actionsOf = (seq) => Object.fromEntries(Object.entries(S.actions).filter(([, a]) => a.seq === seq));

async function resolveVote() {
  const r = S.room;
  const acts = actionsOf(r.phaseSeq);
  const alive = aliveList();
  const votes = alive.map((p) => acts[p.uid]?.target).filter((t) => t && S.players[t]?.alive);
  const flags = flagsOf(r);
  const pending = tallyTop(votes, flags.doubleExile ? 2 : 1);
  const hasDead = playerList().some((p) => !p.alive);
  if (flags.revive && hasDead) await setPhase("revive_vote", { pendingExile: pending }, TIME.revive);
  else await setPhase("skill", { pendingExile: pending, reviveTarget: null }, TIME.skill);
}

async function resolveRevive() {
  const r = S.room;
  const acts = actionsOf(r.phaseSeq);
  const votes = aliveList().map((p) => acts[p.uid]?.revive).filter((t) => t && S.players[t] && !S.players[t].alive);
  const top = tallyTop(votes, 1);
  await setPhase("skill", { reviveTarget: top[0] ?? null }, TIME.skill);
}

async function resolveSkill() {
  const r = S.room;
  const flags = flagsOf(r);
  const roles = {}, alive = {}, doctorUsed = {};
  playerList().forEach((p) => { roles[p.uid] = S.secrets[p.uid]?.role; alive[p.uid] = p.alive; doctorUsed[p.uid] = !!S.secrets[p.uid]?.doctorUsed; });
  const res = resolveNight({
    roles, alive, pendingExile: r.pendingExile || [], actions: actionsOf(r.phaseSeq), doctorUsed, night0: false,
    effects: { allKnight: flags.allKnight, allSeer: flags.allSeer, noAttack: flags.noAttack, extraAttack: flags.extraAttack, reviveVoteTarget: r.reviveTarget },
  });
  const batch = fb.writeBatch(fb.db);
  Object.entries(res.alive).forEach(([u, a]) => { if (S.players[u].alive !== a) batch.update(fb.playerRef(S.roomId, u), { alive: a }); });
  if (res.log.doctorUsed) batch.update(fb.secretRef(S.roomId, res.log.doctorUsed), { doctorUsed: true });
  const turn = r.turn + 1;
  const aliveRoles = Object.keys(res.alive).filter((u) => res.alive[u]).map((u) => roles[u]);
  let ending = res.win;
  if (!ending && turn > r.maxTurns) ending = finalWin(aliveRoles);
  batch.update(roomR(), {
    phase: "morning_report", phaseSeq: r.phaseSeq + 1, phaseEndsAt: null, turn,
    morningReport: { exiled: res.log.exiled, victims: [...res.log.attacked, ...res.log.retaliated, ...res.log.follow], revived: res.log.revived, guardedSuccess: !!res.guardedSuccess },
    ending: ending || null, effectState: null, pendingExile: [], reviveTarget: null,
  });
  await batch.commit();
}

async function finish() {
  const r = S.room;
  const finalRoles = {};
  playerList().forEach((p) => { finalRoles[p.uid] = S.secrets[p.uid]?.role ?? "citizen"; });
  await setPhase("finished", { status: "finished", winner: r.ending, finalRoles });
}

/* ------------------------------ 占い・霊媒の即時回答 ------------------------------ */
async function handleInbox() {
  const r = S.room;
  if (!["night0", "skill"].includes(r.phase)) return;
  const seq = r.phaseSeq;
  const flags = flagsOf(r);
  for (const [uid, a] of Object.entries(S.actions)) {
    if (a.seq !== seq) continue;
    const role = S.secrets[uid]?.role;
    if (!role) continue;
    const cap = capabilities(role, { allSeer: flags.allSeer && r.phase === "skill" });
    if (a.seerTarget && cap.seer && !handled.has(`${seq}:${uid}:s`)) {
      handled.add(`${seq}:${uid}:s`);
      const result = flags.seerOff && r.phase === "skill" ? "void" : judgeSeer(S.secrets[a.seerTarget]?.role);
      await fb.updateDoc(fb.secretRef(S.roomId, uid), { inbox: { id: `${seq}:seer`, kind: "seer", target: a.seerTarget, result } });
    }
    if (a.mediumReq && cap.medium && r.phase === "skill" && !handled.has(`${seq}:${uid}:m`)) {
      handled.add(`${seq}:${uid}:m`);
      const results = (r.pendingExile || []).map((u) => ({ uid: u, result: judgeMedium(S.secrets[u]?.role) }));
      await fb.updateDoc(fb.secretRef(S.roomId, uid), { inbox: { id: `${seq}:medium`, kind: "medium", results } });
    }
  }
}
