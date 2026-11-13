// ゲーム定数データ（役職・タスク・効果・お題）
export const MAX_PLAYERS = 10;
export const MIN_PLAYERS = 3;

// フェーズ制限時間(秒)
export const TIME = { intro: 180, day: 300, vote: 120, revive: 60, skill: 120, mash: 60, quiz: 60, relay: 60, timer: 60 };

export const ROLES = {
  wolf_god: { name: "人狼神", team: "wolf", img: "img/role_wolf_god.svg", desc: "全員の役職が最初からわかる。夜に市民を襲撃する。（占い・霊媒では「人狼」）" },
  werewolf: { name: "人狼", team: "wolf", img: "img/role_werewolf.svg", desc: "人狼同士は互いがわかる。協力して夜に市民を襲撃する。（占いでは「人狼」）" },
  madman: { name: "狂人", team: "wolf", img: "img/role_madman.svg", desc: "人狼の味方をする人間。夜の行動なし。占い結果は「人間」と出る。" },
  psycho: { name: "サイコキラー", team: "wolf", img: "img/role_psycho.svg", desc: "夜に自分へ関わった（占い・護衛・襲撃・蘇生）プレイヤーを返り討ちにする。占い結果は「人間」。" },
  citizen: { name: "市民", team: "citizen", img: "img/role_citizen.svg", desc: "特殊能力なし。議論・タスク貢献度・投票で人狼を追放しよう。" },
  seer: { name: "占い師", team: "citizen", img: "img/role_seer.svg", desc: "毎夜1人を占い「人狼」か「人間」かその場ですぐ知る。" },
  medium: { name: "霊媒師", team: "citizen", img: "img/role_medium.svg", desc: "夜に、直前に追放された人が「人狼」だったかその場ですぐ知る。" },
  knight: { name: "騎士", team: "citizen", img: "img/role_knight.svg", desc: "毎夜1人を人狼の襲撃から守る。" },
  lovers: { name: "恋人", team: "citizen", img: "img/role_lovers.svg", desc: "2人1セット。お互いが誰かわかる。片方が死ぬともう片方も後追いする。" },
  cosplayer: { name: "コスプレイヤー", team: "citizen", img: "img/role_cosplayer.svg", desc: "毎夜1人を護衛できるが、占われると「人狼」と判定される。" },
  doctor: { name: "奇跡の医者", team: "citizen", img: "img/role_doctor.svg", desc: "ゲーム中1回だけ死者を蘇生できる（サイコキラーを蘇生すると自分が死ぬ）。" },
};

export const WOLF_CONFIG = [
  { id: "wolf_god", e: "👁️" },
  { id: "werewolf", e: "🐺" },
  { id: "madman", e: "🃏" },
  { id: "psycho", e: "🔪" },
];
export const CITIZEN_CONFIG = [
  { id: "seer", e: "🔮", slots: 1 },
  { id: "medium", e: "🕯️", slots: 1 },
  { id: "knight", e: "🛡️", slots: 1 },
  { id: "lovers", e: "💕", slots: 2, sub: "2人組" },
  { id: "cosplayer", e: "🎭", slots: 1, sub: "占い黒" },
  { id: "doctor", e: "💉", slots: 1, sub: "1回蘇生" },
];

export const DEFAULT_ROLE_CONFIG = {
  wolf_god: 1, werewolf: 1, madman: 0, psycho: 0,
  seer: true, medium: false, knight: true, lovers: false, cosplayer: false, doctor: false,
};

// ミニゲーム
export const TASKS = [
  { id: "mash", name: "みんなで連打！", rule: "1分間で「生存人数×100回」を全員で連打しよう", img: "img/task_mash.svg", title: "👆 みんなで連打" },
  { id: "match", name: "気持ちを合わせろクイズ！", rule: "お題に全員が同じ回答を揃えよう", img: "img/task_match_quiz.svg", title: "🤝 気持ちを合わせろクイズ" },
  { id: "unique", name: "かぶっちゃだめよクイズ！", rule: "お題に全員バラバラの回答をしよう", img: "img/task_unique_quiz.svg", title: "🚫 かぶっちゃだめよクイズ" },
  { id: "relay", name: "みんな答えろクイズ！", rule: "1分以内に順番にかぶらず回答しよう", img: "img/task_relay_quiz.svg", title: "⏱️ みんな答えろクイズ" },
  { id: "timer", name: "10秒チャレンジ！", rule: "体内時計で10.0秒（±0.5秒）を狙おう", img: "img/task_timer10.svg", title: "🔟 10秒チャレンジ" },
];

// 成功報酬5種 / 失敗時の罰3種
export const EFFECTS = [
  { id: "all_knight", type: "reward", short: "全員ナイト", name: "今晩、市民全員がナイト（護衛）スキルを使用可能！", img: "img/effect_all_knight.svg" },
  { id: "all_seer", type: "reward", short: "全員占い", name: "今晩、全員が占い師の能力を使える！", img: "img/effect_all_seer.svg" },
  { id: "revive", type: "reward", short: "脱落者復活", name: "夜に脱落者を1人、投票で復活できる！", img: "img/effect_revive.svg" },
  { id: "no_attack", type: "reward", short: "夜襲封じ", name: "今晩、人狼の夜襲が封じられる！", img: "img/effect_no_attack.svg" },
  { id: "wolf_count", type: "reward", short: "人狼数公開", name: "生存している人狼陣営の人数が公開される！", img: "img/effect_wolf_count.svg" },
  { id: "extra_attack", type: "penalty", short: "夜襲+1", name: "失敗すると今晩の夜襲対象が＋1人増える…！", img: "img/penalty_extra_attack.svg" },
  { id: "seer_off", type: "penalty", short: "占い無効", name: "失敗すると今晩、占い師のスキルが無効に…！", img: "img/penalty_seer_off.svg" },
  { id: "double_exile", type: "penalty", short: "2人追放", name: "失敗すると今晩の追放投票で上位2人が追放…！", img: "img/penalty_double_exile.svg" },
];

// 気持ち合わせ・かぶり禁止のお題
export const QUIZ_TOPICS = [
  { text: "赤い果物", kind: "hira" },
  { text: "果物", kind: "hira" },
  { text: "動物", kind: "hira" },
  { text: "夏といえば", kind: "kanji" },
  { text: "色", kind: "kanji" },
  { text: "野菜", kind: "hira" },
  { text: "スポーツ", kind: "hira" },
  { text: "乗り物", kind: "kanji" },
  { text: "季節", kind: "kanji" },
  { text: "寿司のネタ", kind: "hira" },
  { text: "飲み物", kind: "hira" },
  { text: "教科", kind: "kanji" },
];

// みんな答えろ（47都道府県）[漢字(接尾辞除く), ひらがな(接尾辞除く), 接尾辞漢字, 接尾辞かな]
const PREF = "北海|ほっかい|道|どう,青森|あおもり|県|けん,岩手|いわて|県|けん,宮城|みやぎ|県|けん,秋田|あきた|県|けん,山形|やまがた|県|けん,福島|ふくしま|県|けん,茨城|いばらき|県|けん,栃木|とちぎ|県|けん,群馬|ぐんま|県|けん,埼玉|さいたま|県|けん,千葉|ちば|県|けん,東京|とうきょう|都|と,神奈川|かながわ|県|けん,新潟|にいがた|県|けん,富山|とやま|県|けん,石川|いしかわ|県|けん,福井|ふくい|県|けん,山梨|やまなし|県|けん,長野|ながの|県|けん,岐阜|ぎふ|県|けん,静岡|しずおか|県|けん,愛知|あいち|県|けん,三重|みえ|県|けん,滋賀|しが|県|けん,京都|きょうと|府|ふ,大阪|おおさか|府|ふ,兵庫|ひょうご|県|けん,奈良|なら|県|けん,和歌山|わかやま|県|けん,鳥取|とっとり|県|けん,島根|しまね|県|けん,岡山|おかやま|県|けん,広島|ひろしま|県|けん,山口|やまぐち|県|けん,徳島|とくしま|県|けん,香川|かがわ|県|けん,愛媛|えひめ|県|けん,高知|こうち|県|けん,福岡|ふくおか|県|けん,佐賀|さが|県|けん,長崎|ながさき|県|けん,熊本|くまもと|県|けん,大分|おおいた|県|けん,宮崎|みやざき|県|けん,鹿児島|かごしま|県|けん,沖縄|おきなわ|県|けん";
export const PREFECTURES = PREF.split(",").map((s) => {
  const [k, h, sk, sh] = s.split("|");
  return { k, h, sk, sh };
});
export const RELAY_TOPICS = [
  { text: "都道府県", kind: "kanji" },
  { text: "都道府県", kind: "hira" },
];
