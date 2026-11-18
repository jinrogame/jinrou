import test from "node:test";
import assert from "node:assert/strict";
import {
  assignRoles, resolveNight, checkWin, finalWin, judgeSeer, judgeMedium, tallyTop, tallyTopWithTie, evalTask, findPref, roleCounts, generateRoomId,
} from "../js/engine.js";

const mk = (roleMap) => {
  const roles = roleMap, alive = {};
  Object.keys(roles).forEach((u) => { alive[u] = true; });
  return { roles, alive };
};
const seqRng = (...v) => { let i = 0; return () => v[i++ % v.length]; };

test("assignRoles: 人数と枚数が一致し恋人は相互参照", () => {
  const uids = Array.from({ length: 10 }, (_, i) => `u${i}`);
  const cfg = { wolf_god: 1, werewolf: 1, madman: 0, psycho: 1, seer: true, medium: true, knight: true, lovers: true, cosplayer: false, doctor: true };
  const a = assignRoles(uids, cfg);
  assert.equal(Object.keys(a).length, 10);
  const cnt = {};
  Object.values(a).forEach((x) => { cnt[x.role] = (cnt[x.role] || 0) + 1; });
  assert.equal(cnt.wolf_god, 1); assert.equal(cnt.lovers, 2); assert.equal(cnt.citizen, 1);
  const lv = Object.keys(a).filter((u) => a[u].role === "lovers");
  assert.equal(a[lv[0]].partner, lv[1]); assert.equal(a[lv[1]].partner, lv[0]);
  assert.deepEqual(roleCounts(cfg, 10), { wolf: 3, special: 6, auto: 1 });
  assert.throws(() => assignRoles(["a"], cfg));
});

test("占い/霊媒判定", () => {
  assert.equal(judgeSeer("cosplayer"), "wolf");
  assert.equal(judgeSeer("psycho"), "human");
  assert.equal(judgeSeer("madman"), "human");
  assert.equal(judgeSeer("wolf_god"), "wolf");
  assert.equal(judgeMedium("cosplayer"), "human");
  assert.equal(judgeMedium("werewolf"), "wolf");
});

test("夜襲：護衛されていれば失敗、されていなければ死亡", () => {
  const base = mk({ w: "werewolf", k: "knight", c: "citizen", d: "citizen" });
  let r = resolveNight({ ...base, pendingExile: [], actions: { w: { attackTarget: "c" }, k: { guardTarget: "c" } } });
  assert.equal(r.alive.c, true);
  r = resolveNight({ ...base, pendingExile: [], actions: { w: { attackTarget: "d" }, k: { guardTarget: "c" } } });
  assert.equal(r.alive.d, false); assert.deepEqual(r.log.attacked, ["d"]);
});

test("追放者のスキルは無効（騎士が追放されたら護衛しない）", () => {
  const base = mk({ w: "werewolf", k: "knight", c: "citizen", x: "citizen" });
  const r = resolveNight({ ...base, pendingExile: ["k"], actions: { w: { attackTarget: "c" }, k: { guardTarget: "c" } } });
  assert.equal(r.alive.k, false); assert.equal(r.alive.c, false);
});

test("サイコキラー：占い師/騎士/襲撃した人狼が返り討ち。初日夜は無効", () => {
  const base = mk({ p: "psycho", s: "seer", k: "knight", w: "werewolf", c: "citizen", c2: "citizen" });
  let r = resolveNight({ ...base, pendingExile: [], actions: { s: { seerTarget: "p" }, k: { guardTarget: "p" }, w: { attackTarget: "p" } } });
  assert.equal(r.alive.s, false); assert.equal(r.alive.k, false); assert.equal(r.alive.w, false); assert.equal(r.alive.p, true);
  r = resolveNight({ ...base, pendingExile: [], night0: true, actions: { s: { seerTarget: "p" } } });
  assert.equal(r.alive.s, true);
});

test("奇跡の医者：蘇生。サイコを蘇生すると医者が死亡。夜襲された医者は無効", () => {
  const base = mk({ d: "doctor", w: "werewolf", c: "citizen", p: "psycho", c2: "citizen" });
  base.alive.c = false; base.alive.p = false;
  let r = resolveNight({ ...base, pendingExile: [], doctorUsed: {}, actions: { d: { reviveTarget: "c" } } });
  assert.equal(r.alive.c, true); assert.equal(r.log.doctorUsed, "d");
  r = resolveNight({ ...base, pendingExile: [], doctorUsed: {}, actions: { d: { reviveTarget: "p" } } });
  assert.equal(r.alive.p, true); assert.equal(r.alive.d, false);
  r = resolveNight({ ...base, pendingExile: [], doctorUsed: {}, actions: { d: { reviveTarget: "c" }, w: { attackTarget: "d" } } });
  assert.equal(r.alive.d, false); assert.equal(r.alive.c, false);
  r = resolveNight({ ...base, pendingExile: [], doctorUsed: { d: true }, actions: { d: { reviveTarget: "c" } } });
  assert.equal(r.alive.c, false);
});

test("恋人の後追い（今夜死んだ人のみ）", () => {
  const base = mk({ w: "werewolf", a: "lovers", b: "lovers", c: "citizen" });
  const r = resolveNight({ ...base, pendingExile: [], actions: { w: { attackTarget: "a" } } });
  assert.equal(r.alive.a, false); assert.equal(r.alive.b, false);
  const base2 = mk({ w: "werewolf", a: "lovers", b: "lovers", c: "citizen", d: "citizen" });
  base2.alive.a = false;
  const r2 = resolveNight({ ...base2, pendingExile: [], actions: { w: { attackTarget: "c" } } });
  assert.equal(r2.alive.b, true);
});

test("報酬/罰：夜襲封じ・夜襲+1・復活・全員ナイト", () => {
  const base = mk({ w: "werewolf", c: "citizen", d: "citizen", e: "citizen" });
  let r = resolveNight({ ...base, pendingExile: [], effects: { noAttack: true }, actions: { w: { attackTarget: "c" } } });
  assert.equal(r.alive.c, true);
  r = resolveNight({ ...base, pendingExile: [], effects: { extraAttack: true }, actions: { w: { attackTarget: "c" } }, rng: seqRng(0) });
  assert.equal(Object.values(r.alive).filter((x) => !x).length, 2);
  const b2 = mk({ w: "werewolf", c: "citizen", d: "citizen" });
  b2.alive.d = false;
  r = resolveNight({ ...b2, pendingExile: [], effects: { reviveVoteTarget: "d" }, actions: {} });
  assert.equal(r.alive.d, true);
  r = resolveNight({ ...base, pendingExile: [], effects: { allKnight: true }, actions: { w: { attackTarget: "c" }, d: { guardTarget: "c" } } });
  assert.equal(r.alive.c, true);
});

test("勝敗判定", () => {
  // 人狼側と市民側が同数（1 vs 1）の場合は人狼勝利
  assert.equal(checkWin(["werewolf", "citizen"]), "wolf");

  // 【狂人・サイコキラーのカウントテスト】
  // 人狼1人、狂人1人、市民1人（人狼1 vs 非人狼2）➔ 人狼が下回るためゲーム継続
  assert.equal(checkWin(["werewolf", "madman", "citizen"]), null);
  // 人狼1人、サイコ1人、市民1人（人狼1 vs 非人狼2）➔ 人狼が下回るためゲーム継続
  assert.equal(checkWin(["werewolf", "psycho", "citizen"]), null);
  // 人狼1人、狂人1人（人狼1 vs 非人狼1）➔ 同数成立で人狼勝利
  assert.equal(checkWin(["werewolf", "madman"]), "wolf");
  // 人狼1人、サイコ1人（人狼1 vs 非人狼1）➔ 同数成立で人狼勝利
  assert.equal(checkWin(["werewolf", "psycho"]), "wolf");
  // 人狼0人、狂人1人、市民1人 ➔ 人狼本体が全滅したため市民陣営の勝利
  assert.equal(checkWin(["madman", "citizen"]), "citizen");
  // 人狼0人、サイコ1人、市民1人 ➔ 人狼本体が全滅したため市民陣営の勝利
  assert.equal(checkWin(["psycho", "citizen"]), "citizen");
  // 人狼0人、狂人1人 ➔ 市民陣営の勝利
  assert.equal(checkWin(["madman"]), "citizen");

  // 市民側の方が多い（1 vs 2）場合はゲーム継続（null）
  assert.equal(checkWin(["werewolf", "citizen", "citizen"]), null);
  // 人狼が全滅した場合は市民勝利
  assert.equal(checkWin(["citizen", "seer"]), "citizen");

  // 最終ターン終了時判定
  assert.equal(finalWin(["werewolf", "citizen"]), "wolf");
  assert.equal(finalWin(["werewolf", "citizen", "citizen"]), "citizen");
  assert.equal(finalWin(["werewolf", "madman", "citizen"]), "citizen"); // 1 vs 2 で人間側が多い
  assert.equal(finalWin(["madman", "citizen"]), "citizen"); // 人狼0人
});

test("tallyTop / tallyTopWithTie: 多数決・スキップ・同票ルーレット候補", () => {
  assert.deepEqual(tallyTop(["a", "b", "a"], 1), ["a"]);
  assert.deepEqual(tallyTop(["a", "a", "b", "c"], 2, () => 0).length, 2);
  assert.deepEqual(tallyTop([], 1), []);
  // 全員「誰にも投票しない(__skip__)」の場合は追放なし
  assert.deepEqual(tallyTopWithTie(["__skip__", "__skip__"], 1), { selected: [], tieCandidates: [] });
  // 単独最多得票の場合は tieCandidates は空
  assert.deepEqual(tallyTopWithTie(["a", "a", "b", "__skip__"], 1), { selected: ["a"], tieCandidates: [] });
  // 同票の場合は tieCandidates に同票候補が入り、selected に1人選ばれる
  const tie = tallyTopWithTie(["a", "b", "a", "b", "__skip__"], 1, () => 0);
  assert.equal(tie.selected.length, 1);
  assert.deepEqual(tie.tieCandidates.sort(), ["a", "b"]);
});

test("ミニゲーム評価", () => {
  const e = (...v) => v.map((x, i) => ({ uid: `u${i}`, v: x }));
  assert.equal(evalTask("mash", e(1500, 1500, 1000), {}).success, true);
  assert.equal(evalTask("mash", e(500, 500, 499), {}).success, false);
  assert.equal(evalTask("match", e("りんご", "リンゴ", "りんご"), { kind: "hira" }).success, true);
  assert.equal(evalTask("match", e("りんご", "みかん"), { kind: "hira" }).success, false);
  assert.equal(evalTask("unique", e("a", "b", "c"), { kind: "kanji" }).success, true);
  assert.equal(evalTask("unique", e("a", "a", "c"), { kind: "kanji" }).success, false);
  assert.equal(evalTask("unique", e("a", undefined), {}).success, false);
  assert.equal(evalTask("timer", e(10.2, 9.5, 10.5), {}).success, true);
  assert.equal(evalTask("timer", e(10.2, 11), {}).success, false);
  assert.equal(evalTask("relay", e("東京", "大阪"), {}).success, true);
});

test("都道府県判定（漢字/ひらがな・接尾辞あり/なし）", () => {
  assert.ok(findPref("東京都", "kanji") >= 0);
  assert.ok(findPref("東京", "kanji") >= 0);
  assert.equal(findPref("東京", "kanji"), findPref("東京都", "kanji"));
  assert.ok(findPref("ぎふけん", "hira") >= 0);
  assert.ok(findPref("ぎふ", "hira") >= 0);
  assert.ok(findPref("ほっかいどう", "hira") >= 0);
  assert.ok(findPref("北海道", "kanji") >= 0);
  assert.equal(findPref("とうきょう", "kanji"), -1);
  assert.equal(findPref("パリ", "kanji"), -1);
});

test("ルームID：4桁の紛らわしくない文字", () => {
  for (let i = 0; i < 50; i++) assert.match(generateRoomId(), /^[A-HJ-NP-Z2-9]{4}$/);
});
