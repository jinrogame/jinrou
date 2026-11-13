# デザイナー向け 差し替え画像一覧（`mockup2/img/`）

`mockup2/index.html` が参照する画像はすべてこのフォルダにあります。**同じファイル名・同じ縦横比で上書きするだけ**で画面に反映されます（SVG のまま PNG/WebP 等に変える場合は `index.html` / `app.js` 内の拡張子を置換してください）。
現在の画像はコード生成のプレースホルダーです（右下/下部に小さくファイル名が入っています）。

> **💡 画面スクロール防止（1画面完結）のためのサイズ制御について**
> `mockup2/styles.css` では、全15画面がスマートフォンの1画面（`100dvh`）にスクロールなしでぴったり収まるよう、画像コンテナ側の最大表示高さをビューポート比率（役職カード：`max-height: 44dvh`、バナー・タスクイラスト：`max-height: 13〜14dvh`、タイトルロゴ：`max-height: 17dvh`）で自動制御しています。そのため、デザイナーが高解像度（2倍サイズ等）の画像に差し替えても画面が縦に溢れてスクロールが発生することはありません。

## 1. 役職カード（ポケモンカード比率 63:88 ≒ 5:7 縦長）— 12点

推奨 `400 × 560 px`（高解像度は `800 × 1120 px`）。役職名・陣営・スキル説明もカード画像内に含めるデザインです（HTML側にも同じ文言を別表示）。

| ファイル | 内容 |
| :--- | :--- |
| `role_card_back.svg` | カード裏面（役職発表の「タップしてめくる」状態） |
| `role_wolf_god.jpg` | 人狼神（人狼陣営・右下文字「狼神」） |
| `role_werewolf.jpg` | 人狼（人狼陣営・右下文字「狼」） |
| `role_madman.jpg` | 狂人（人狼陣営・右下文字「狂」） |
| `role_psycho.jpg` | サイコキラー（人狼陣営・右下文字「鬼」） |
| `role_citizen.jpg` | 市民（市民陣営・右下文字「民」） |
| `role_seer.jpg` | 占い師（市民陣営・右下文字「占」） |
| `role_medium.jpg` | 霊媒師（市民陣営・右下文字「霊」） |
| `role_knight.jpg` | 騎士（市民陣営・右下文字「騎」） |
| `role_lovers.jpg` | 恋人（市民陣営・右下文字「恋」） |
| `role_cosplayer.jpg` | コスプレイヤー（市民陣営・右下文字「化」） |
| `role_doctor.jpg` | 奇跡の医者（市民陣営・右下文字「医」） |

## 2. プレイヤーアバター（正円で表示）— 10点
`avatar_01.svg` 〜 `avatar_10.svg`　推奨 `160 × 160 px`（正方形・円形にクロップされます）

## 3. 画面背景（縦長 390 × 844 目安）— 5点
| ファイル | 使用画面 |
| :--- | :--- |
| `bg_title.svg` | 01 トップ |
| `bg_night.svg` | 02/03/04/06/12/13（ロビー・役職発表・夜） |
| `bg_morning.svg` | 07〜10（朝のターン） |
| `bg_day.svg` | 05 自己紹介・11 昼のターン |
| `bg_result.svg` | 14 結果発表 |

## 4. ロゴ・ヒーロー・勝敗バナー
| ファイル | 推奨サイズ | 使用画面 |
| :--- | :---: | :--- |
| `logo_title.svg` | 400 × 300 | 01 トップ（ロゴ） |
| `hero_morning.svg` | 600 × 240 | 07 朝①ヘッダー |
| `hero_intro.svg` / `hero_day.svg` / `hero_night.svg` | 600 × 240 | 予備（各フェーズのヘッダー用） |
| `victory_citizen.svg` | 600 × 300 | 14 市民陣営 勝利 |
| `victory_wolf.svg` | 600 × 300 | 14 人狼陣営 勝利 |
| `victory_draw.svg` | 600 × 300 | 14 引き分け |

## 5. ミニゲーム・効果（報酬/罰）イラスト — 400 × 260（文字なしのイラスト）
| ファイル | 使用画面 / 内容 |
| :--- | :--- |
| `task_mash.svg` | ミニゲーム① みんなで連打 |
| `task_match_quiz.svg` | ② 気持ちを合わせろクイズ |
| `task_unique_quiz.svg` | ③ かぶっちゃだめよクイズ |
| `task_relay_quiz.svg` | ④ みんな答えろクイズ |
| `task_timer10.svg` | ⑤ 10秒チャレンジ |
| `effect_all_knight.svg` | 報酬：全員ナイトスキル |
| `effect_all_seer.svg` | 報酬：全員占い師スキル |
| `effect_revive.svg` | 報酬：脱落者1名復活（12-2 復活投票でも使用） |
| `effect_no_attack.svg` | 報酬：夜襲封じ |
| `effect_wolf_count.svg` | 報酬：人狼陣営の生存数公開 |
| `penalty_extra_attack.svg` | 罰：夜襲対象＋1人 |
| `penalty_seer_off.svg` | 罰：占い師スキル無効 |
| `penalty_double_exile.svg` | 罰：追放投票で2人追放 |
| `icon_spectator.svg` | 死亡者の静観画面 |
| `icon_vote.svg` | 予備（投票系の画面用） |
