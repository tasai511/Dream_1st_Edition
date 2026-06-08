# Dream-1 コンテキスト

## 概要

Dream-1 は、バットの素振りを楽しく続けるための小型スイングモチベーションデバイスです。

科学的な計測器ではありません。真のバットヘッドスピードや打球速度を測るものではなく、同じユーザー、同じバット、同じ装着位置での相対比較を目的にしたトレーニング用スコアを出します。

主な目的:

- 素振り回数を増やす
- 良いスイングの体感を数字で補助する
- 同じ条件下での自己比較をしやすくする
- 子供でもスコアが出て楽しい体験にする

Dream-1 は、正確に測る装置ではなく、良い練習を増やす装置である。

---

## 記録アプリ: Swing Log 現行実装

Dream-1 の記録アプリは、厳密なトレーニング評価ではなく「素振りを続けたくなる記録とバッジ収集」のための PWA として実装している。

重視すること:

- 毎日少しでも振りたくなる
- あと少しで取れる感を出す
- 回数、平均、ベスト、練習日数の積み上げを見せる
- 他人比較ではなく、同じ名前、同じバット、同じ端末内での自己比較を中心にする
- Dream-1 は厳密フォーム解析機ではなく、素振りを楽しく続けるための道具として扱う

### 技術構成

- 実装本体は `app/src/App.jsx`
- React 18 + Vite
- CSS は `app/src/styles.css`
- PWA 用に `app/public/manifest.webmanifest` と `app/public/service-worker.js` を使う
- service worker は静的アセット、画像、音声を cache する
- データ保存は IndexedDB ではなく `localStorage`
- storage key は `dream1-swing-tracker-v1`
- サーバー保存、ログイン、クラウド同期はない

### アプリデータ

`localStorage` に保存する DB は概ね以下。

```ts
type AppDb = {
  activeName: string;
  names: string[];
  nameColors: Record<string, string>;
  bats: string[];
  batColors: Record<string, string>;
  defaultBat: string;
  theme: string;
  fontTheme: string;
  records: SwingRecord[];
  seasonEventSettings: SeasonEventSettings;
  badgeRewardGoal: string;
  badgeRewardText: string;
  testInputDefaults: boolean;
  testRandomGeneration: boolean;
  testDate: string | null;
};

type SwingRecord = {
  id: string;
  name: string;
  bat: string;
  date: string;  // YYYY-MM-DD
  count: number;
  avg: number;   // 0..999
  best: number;  // 0..999
};

type SeasonEventSettings = Record<
  "spring" | "summer" | "winter",
  { startMonth: number; startDay: number; endMonth: number; endDay: number }
>;
```

名前とバットが1件以上ない場合は、設定画面へ誘導する。
記録は同じ日付、名前、バットでも物理的には結合せず、`records` に追加する。表示時に日付別、バット別へ集計する。

### 入力と CSV

ホーム画面から以下を入力する。

- バット
- 回数
- 平均スコア
- ベストスコア

保存時の丸め:

- `count`: 最低 `1`
- `avg`: `0..999` に clamp
- `best`: `0..999` に clamp

CSV 出力:

```csv
name,bat,date,count,avg,best
```

CSV 読込では、存在しない名前やバットを自動追加し、各行を新しい record として追加する。既存 record との物理的な重複統合はしない。

### 集計

日次集計:

```ts
dailyCount = sum(record.count)
dailyAvg = round(sum(record.avg * record.count) / dailyCount)
dailyBest = max(record.best)
dailyBats = unique(record.bat)
```

バット別集計も同じ考え方で、バットごとに回数合計、回数加重平均、ベスト最大値を出す。

期間集計:

- 今日: 対象日だけ
- 今週: 月曜始まり、日曜終わり
- 今月: 暦月
- チャレンジ画面の今年: 初回記録日を起点にした1年サイクル
- 年間バッジ判定: 暦年単位

期間平均は、期間内 record の `avg * count` を回数で割った加重平均。
練習日数は、`count > 0` の日数。

### 画面構成

下部ナビゲーション:

- ホーム
- チャレンジ
- バッジ
- データ
- 設定

ホーム:

- 日付選択
- スコア入力
- 今日または選択日の回数、平均、ベスト
- 取得バッジ
- バット別の回数、平均、ベスト
- 記録追加時のスコアアニメーションと初取得バッジポップアップ

チャレンジ:

- 今週、今月、今年のスイング数
- 今週、今月、今年の練習日数
- 選択バットの過去最高平均、過去最高ベスト

バッジ:

- バッジポイント
- 目標ポイントとごほうび入力
- コレクション一覧
- カテゴリ filter: スイング数、練習日数、平均、ベスト、すべて
- レア度ごとの表示

データ:

- 毎日、毎週、毎月のグラフ
- スイング数グラフ
- 平均/ベストのスコアグラフ
- バット filter

設定:

- 名前の登録、切り替え、削除、色設定
- バットの登録、削除、色設定、デフォルトバット
- CSV 出力、CSV 読込
- 全データ削除
- デモデータ作成
- テストモード

### バッジ

バッジ取得履歴は別テーブルに保存しない。
`records` から `badgesFor()` で毎回再計算し、`collectBadgeCounts()` でコレクション表示用の個数に変換する。

レア度:

```ts
type BadgeRarity = "D" | "C" | "B" | "A" | "S" | "SS";

const rarityPoint = {
  D: 1,
  C: 2,
  B: 5,
  A: 10,
  S: 25,
  SS: 100,
};
```

レア度名:

- D: Dream
- C: Challenge
- B: Brave
- A: Ace
- S: Star
- SS: Super Star

実装済みバッジ:

| 種別 | 指標 | 閾値 |
| --- | --- | --- |
| 今日 | スイング数 | 25, 50, 75, 100 |
| 今日 | 平均 | 250, 350, 450, 550, 650, 750 |
| 今日 | ベスト | 350, 450, 550, 650, 750, 850 |
| 今週 | スイング数 | 125, 250, 375, 500 |
| 今週 | 練習日数 | 1, 2, 3, 4, 5 |
| 今月 | スイング数 | 500, 1000, 1500, 2000 |
| 今月 | 練習日数 | 4, 8, 12, 16, 20 |
| 今年 | スイング数 | 6000, 12000, 18000, 24000 |
| 今年 | 練習日数 | 50, 100, 150, 200, 225, 250 |
| 初突破 | バット別過去最高平均 | 400, 500, 600, 700, 750, 800 |
| 初突破 | バット別過去最高ベスト | 500, 600, 700, 800, 850, 900 |

`unique` はコレクション上で1個まで。
`repeatable` は取得回数分だけ個数とポイントに加算する。
初突破系はバットごとの過去最高更新時に、その閾値を初めて超えた日に付与する。

### テスト機能

設定画面からデモデータを作成できる。
テストモードでは任意の日付へ進め、未入力日の練習記録を自動生成できる。
この機能は UI とバッジ演出の検証用で、本番の記録仕様とは分けて考える。

---

## 非交渉原則

- 子供が振って楽しいことを最優先する
- 999 は簡単に出さない
- 普通のスイングで無反応にしすぎない
- 変な振り方を高得点にしない
- 電池寿命を著しく削る変更は避ける
- スコアの納得感を、物理精度より優先する

---

## 参考スコアレンジ

現時点の体感チューニング目安:

- 普通の子供スイング: 320〜520
- 良いスイング: 550〜750
- かなり良いスイング: 800+
- 999 は稀

このレンジは絶対値ではない。  
同じユーザー、同じバット、同じ装着位置で比較したときに納得感が出ることを優先する。

スコアの思想:

- 高得点 = 強く、早く、再現性高くインパクトを作れそうなスイング
- 低得点 = 遠回り、遅い、ブレる、弱いスイング
- 大ぶり = 力強いスイングではなく、遠回りで当たりにくそうなスイング
- 良いスイング = 十分な加速エリアの中で角速度も高く出る、鋭く振り切れたスイング

---

## ハードウェア

### MCU

- ATtiny3226
- 10MHz
- Arduino framework
- PlatformIO

### IMU

- LSM6DSV80X
- SPI 接続
- CS: PA4
- FIFO と割り込みを使用
- タップ検出も IMU 側から取得する

### ブザー

- 圧電ブザー
- 差動駆動
- BUZZER_P: PA6
- BUZZER_N: PA7

注意:

- Serial TX はブザーやピン割り当てと干渉し得る
- 実運用では Serial 接続を前提にしない
- デバッグ出力は本番経路に入れない

### 7セグ LED

- 3桁 7セグ LED
- common cathode
- multiplex 駆動

セグメント:

- SEG_A: PB0
- SEG_B: PB2
- SEG_C: PB4
- SEG_D: PB3
- SEG_E: PB1
- SEG_F: PB5
- SEG_G: PC0

桁選択:

- DIGIT_1: PC1
- DIGIT_2: PC2
- DIGIT_3: PC3

表示方針:

- 通常は消灯
- スコア、平均、回数など必要なときだけ短時間表示
- ブザー動作中は表示更新よりブザーを優先する
- 表示ロジックは単純で決定的に保つ

### 電源

- CR2450 コイン電池
- 低消費電力が重要
- 不要な active 時間を増やさない
- idle 時は sleep を使う
- 長時間無操作で最終 sleep に入る

---

## 現在の製品挙動

### 通常状態

- 起動後に短時間キャリブレーションする
- キャリブレーション中は電池残量目安を表示する
- その後は Monitor 状態で IMU を監視する
- 有効なスイングを検出すると Capturing 状態に入り、ピークや特徴量を記録する
- スイング終了後、スコアを計算して表示する
- 表示時間終了後、Monitor に戻る

### ブザー

スイング成立時にブザーを鳴らす。

- ベスト更新: 3回
- 平均以上: 2回
- 平均未満: 1回
- 一定回数ごとの節目: milestone beep

この仕様は現在の実装を正とする。

### 表示

- スイング成立後、スコアを短時間表示する
- 低スコアでもスイングとして成立していれば `100` 以上で表示する
- 無効な動きは表示しない
- Single tap ではスイング回数を表示する
- Double tap では平均スコアを1秒表示し、その後ベストスコアを1秒表示する
- Double tap の平均/ベスト表示中は表示の安定を優先し、スイング検出は受け付けない
- 表示中やスコア直後はタップ誤検出を抑えるために mute 時間を設ける

### タップ

- タップはスコア計算には使わない
- スイング検出とは別系統の入力として扱う
- Single / Double のイベントを扱う
- Double tap は平均表示からベスト表示への2段表示
- 通常スイングのフォロースルーがタップ扱いになりにくいよう、表示直後やスコア直後はタップを抑制する

---

## スコアの意味

スコアは物理量ではありません。以下のような動きの傾向を IMU から拾い、0〜999 の範囲に収めた実用スコアです。

高くしたい動き:

- 十分な角速度ピークがある
- 一定以上の加速度がある程度続いている
- 回転と加速度の両方が出ている
- 同じ条件下で、より強く鋭く振れている

低くしたい動き:

- 弱い
- 遅い
- 回転だけ、または加速度だけに偏っている
- 一瞬だけの衝撃
- 小さい手振り
- ランダムな持ち替え、振動、置いた衝撃

---

## スイング検出

### 開始条件

Monitor 中に以下のような意味のある動きが出たら Capturing を開始する。

- `strength >= kCaptureStartStrength` (`2400`)
- かつ、`gyroMagnitudeRaw >= kCaptureStartGyroRaw` (`900`) または `dynamicAccelMg >= kCaptureStartAccelMg` (`1800`)

`strength` は概ね以下の合成値:

```cpp
gyroMagnitudeRaw + dynamicAccelMg * 4
```

ゆっくりした持ち替えや小さい動きは開始しにくくする。

### キャプチャ中に記録する値

スイング成立判定とスコア再計算のために、主に以下を記録する。

- `gyroPeakRaw`
- `accelPeakMg`
- `firstGyroStrongTimeMs`
- `maxAccelRiseMs`
- `swingAccelAreaMgMs`
- `capturePeakStrength`

スコア計算時は、キャプチャサンプルから `ScoreWindow` を作り直し、その範囲内で `gyroPeakRaw` と `swingAccelAreaMgMs` を再計算する。

### 終了条件

以下のどちらかでキャプチャを終了する。

- 最大キャプチャ時間 `kCaptureMaxMs` (`900 ms`) に達した
- 最小キャプチャ時間 `kCaptureMinMs` (`80 ms`) を超え、`strength` が `capturePeakStrength * kCaptureEndDropPct / 100` (`70%`) 以下になった

### 無効化

`swingEvidence()` によって、動きがスイングらしいかを確認する。

現在の evidence は合計 `6` 点以上でスイング成立。

- スイング時間: `160 ms` 以上で +2、`80 ms` 以上で +1
- gyro peak: `gyroPeakRaw >= 900` で +2
- accel peak: `2000 mg` 以上で +2、`1000 mg` 以上で +1
- accel rise 時間: `35 ms` 以上で +2、`15 ms` 以上で +1
- 強い gyro が一度でも出たら +1
- `capturePeakStrength >= 1800` で +1

`accel rise` はスコアには使わない。  
加速度が一瞬の衝撃ではなく、ある程度立ち上がった動きかを確認するための evidence 専用指標として使う。

低スコア救済は使わない。  
最終スコアが `100` に届いた場合だけスコア表示する。  

---

## スコア計算

現在のスコアは `finishCapture()` で `gyroPeakScore()` と `swingAccelAreaScore()` を計算し、`scoreFromComponents()` で合算する。

構成:

```cpp
score = gyroPeakScore();          // max 500
score += swingAccelAreaScore();   // max 500
score = min(score, 999);
```

整数演算中心で、float は使わない。

採点に入る条件:

- `swingEvidence()` が `6` 点以上
- score が `100` 以上

この条件を満たさない場合は no score。

### ScoreWindow

スコア対象範囲はキャプチャ全体ではなく、キャプチャサンプルから作る `ScoreWindow` で決める。
一時的な山で閉じないよう、まず `scoreStartMs` 以降の最大加速度ピークを確定し、その後の落ち込みで `scoreEndMs` を決める。

- `scoreStartMs`: `dynamicAccelMg > 1000 mg` になった最初のサンプル
- `accelPeakMs`: `ScoreWindow` 内での最大加速度サンプル
- `scoreEndMs`: 加速度ピーク後、ピークから `max(ピークの10%, 1000mg)` 以上落ちた時点の直前サンプル。直前サンプルがピークより前ならピーク時刻にする

つまり、スコア範囲は「1000mg を超えて加速が始まったところ」から「加速度ピーク後に明確に落ち始める直前」まで。
1000mg を下回るまで待たない。

`scoreStartMs` は pre capture sample を含むため、グラフ上では負の時刻になることがある。

### gyroPeakScore

`ScoreWindow` 内の角速度ピークを見る。
グローバルなキャプチャ全体の gyro peak ではなく、加速エリア中の最大 gyro を使う。

- 最大 500 点
- gyro full は実測に合わせて `7000 dps`
- IMU の 4000 dps 設定に合わせて `140 mdps/LSB` として換算する
- 7000 dps 以上は 500 点に clamp する

考え方:

- MLB Statcast では 75 mph 以上を fast swing として扱う
- MLB 上位選手の平均 bat speed は 80 mph 前後に達する
- bat speed 80〜85 mph を sweet spot 半径およそ 0.75 m で角速度換算すると約 2700〜2900 dps
- ただし Dream-1 は単一軸ではなく3軸合成の `gyroMagnitudeRaw` を使うため、単純な角速度換算より大きめに出る
- 3000〜4500 dps では子供や軽めのスイングでも上限に届きやすかったため、Dream-1 の実測レンジに合わせて `7000 dps` を使う
- この値は実測ベースの仮置き。上手い人で Gyro 側が簡単に 500 点へ張り付く場合はさらに上げる候補がある

### swingAccelAreaScore

`ScoreWindow` 内に乗った dynamic accel の積算を見る。

```cpp
area = sum((dynamicAccelMg - offset) * dt)
score = area / fullArea * 500
```

手首だけの一瞬の入力ではなく、スイング中に加速度が乗って続いたかを見る。  
現在は `offset` を初めて超えた時刻から、加速度ピーク後に明確に落ち始める直前までの offset 超過分を積算する。

`offset` は `1000 mg`。  
小さい揺れ、構え、ぶらぶらを積算しにくくしつつ、普通のスイングが `0` になりにくい値として実測から置いている。

`fullArea` は `800000 mg*ms`。
これは公開データから直接導いた物理定数ではなく、Dream-1 の実測ベースの仮置き。  
加速度スコア範囲を広げたことで `600000 mg*ms` では軽いバットの強いスイングが上限に張り付きやすくなったため、飽和を少し抑える値として `800000 mg*ms` を採用している。
配点は SwingAccel 側を 500 点、Gyro 側を 500 点にしている。

今後、通常のバットでも簡単に SwingAccel 側が 500 点へ張り付く場合は `900000〜1000000 mg*ms` 程度へ上げる候補がある。逆に一般ユーザーで伸びなさすぎる場合は `700000 mg*ms` 程度へ下げる候補がある。

### accel rise

スイング時間に対して加速度がピークへ向かって立ち上がった時間を見る。

- スコア補正には使わない
- `swingEvidence()` のために記録する

`maxAccelRiseMs` は固定閾値以上の時間ではなく、dynamic accel が立ち上がってからピーク後に減少へ転じるまでの時間として記録する。  
ノイズで1サンプルだけ下がっても減少扱いにしないよう、小さい変化は無視し、連続した減少で判定する。

加速上昇の開始は `kAccelRiseStartMg` 以上で見る。  
これはスイング成立判定用の accel rise 判定であり、スイング開始判定用の `kCaptureStartAccelMg` とは別に扱う。

---

## スコア下限

`scoreFromComponents()` が返すスコアを、そのまま表示、平均、ベスト更新、ブザー判定に使う。

現在の下限:

- score `100` 未満: no score
- score `100` 以上: 採点成立

ただし、無効な動きは表示しない。

---

## 実装構成

### `src/main.cpp`

- 状態遷移
- キャリブレーション
- スイング開始/終了判定
- ピーク記録
- スコア計算
- タップ処理
- 省電力制御

現在はスコア処理も `main.cpp` 内にある。  
将来的に大きくなる場合は `score.cpp / score.h` に分けてもよいが、現状では軽量さと見通しを優先する。

### `telemetry_best_swing_graph.html`

- EEPROM に保存した best swing telemetry を可視化する解析用 HTML
- `score start`、`accel score end`、`accel peak`、`end judge` をグラフに出す
- `gyro score peak` は `ScoreWindow` 内で実際に見えている最大 gyro sample を表示する
- C++ 側では best telemetry 保存時に score gyro peak sample を優先して残す

### `src/imu.cpp` / `include/imu.h`

- IMU 初期化
- FIFO/割り込み処理
- motion sample 読み出し
- tap event 読み出し
- sleep mode 移行

### `src/display.cpp` / `include/display.h`

- 7セグ表示
- multiplex 更新
- 数値表示
- 表示 timeout
- 消灯

### `src/buzzer.cpp` / `include/buzzer.h`

- ブザー初期化
- beep
- milestone beep
- ブザー波形生成
- beep 中はブザーを優先し、短時間ブロッキングしてよい
- off

### `include/tap.h`

- `TapEvent`
- `None`
- `Single`
- `Double`

---

## メインループ方針

- 通常の監視、表示、スイング処理では長い `delay()` を入れない
- スイング成立直後の beep は例外として、ブザーを優先して短時間ブロッキングしてよい
- ブザー動作中は表示更新や IMU 読み出しよりブザー出力を優先する
- 表示は `Display::update()` で継続更新する
- IMU 割り込みがあるときにサンプルを読む
- 割り込みが詰まった場合は一定時間後に強制読み出しする
- Monitor 中で動きがなければ idle sleep に入る
- 長時間無操作なら final sleep に入る

---

## コーディング方針

必須:

- Arduino style の `setup()` / `loop()` を使う
- 整数演算中心
- RAM 使用量を小さく保つ
- コードサイズを増やしすぎない
- 本番経路に Serial debug を入れない
- 状態遷移、表示、ブザー、省電力処理を不用意に崩さない

避ける:

- float 多用
- スイング監視中の長い blocking wait
- 重いライブラリ
- 複雑すぎるゲート処理
- 科学計測器のような絶対精度を目指すこと

---

## チューニング方針

まず触る候補:

- gyro/accel の開始閾値
- `swingAccelAreaScore()` の offset
- `gyroPeakScore()` の full dps
- `swingAccelAreaScore()` の fullArea
- `kGyroPeakScoreMax` / `kSwingAccelAreaScoreMax` の配点比率
- `kScoreAccelDropPct` / `kScoreAccelDropMinMg` による score end 判定

チューニング時の注意:

- 「無反応」と「100連発」は同じ対策で悪化しやすい
- 小さい動きの誤検出を減らしつつ、大ぶり低スコアは表示したい
- 999 は「速いだけ」では出ないようにする
- 子供が普通に振ったときに点が出なさすぎる状態は避ける
- 装着位置やバット長さで値は変わるため、補正は強くしすぎない

---
