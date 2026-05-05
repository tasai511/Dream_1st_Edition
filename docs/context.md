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
- 良いスイング = 回転が先に立ち上がり、その後に加速ピークが来る鋭いスイング

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
- タップ操作では平均スコアまたはスイング回数を表示する
- 表示中やスコア直後はタップ誤検出を抑えるために mute 時間を設ける

### タップ

- タップはスコア計算には使わない
- スイング検出とは別系統の入力として扱う
- Single / Double のイベントを扱う
- 通常スイングのフォロースルーがタップ扱いになりにくいよう、表示直後やスコア直後はタップを抑制する

---

## スコアの意味

スコアは物理量ではありません。以下のような動きの傾向を IMU から拾い、0〜999 の範囲に収めた実用スコアです。

高くしたい動き:

- 回転の立ち上がりが早い
- 十分な角速度ピークがある
- 加速度ピークが十分にある
- 加速が一瞬だけでなく、ある程度続いている
- gyro peak の後に accel peak が少し遅れて来る
- 高速状態が長すぎず、鋭く抜ける
- 強い区間で軸が大きくブレない

低くしたい動き:

- 弱い
- 遅い
- gyro と accel のピークが同時すぎる
- accel peak が gyro peak より先に来る
- accel peak が遅れすぎる
- 高速状態がだらだら続く
- 強い区間で dominant axis が何度も切り替わる
- ランダムな持ち替え、振動、置いた衝撃

---

## スイング検出

### 開始条件

Monitor 中に以下のような意味のある動きが出たら Capturing を開始する。

- `strength >= kCaptureStartStrength`
- かつ、gyro または accel が開始閾値を超える

`strength` は概ね以下の合成値:

```cpp
gyroMagnitudeRaw + dynamicAccelMg * 4
```

ゆっくりした持ち替えや小さい動きは開始しにくくする。

### キャプチャ中に記録する値

- `gyroPeakRaw`
- `accelPeakMg`
- `gyroPeakTimeMs`
- `accelPeakTimeMs`
- `firstGyroStrongTimeMs`
- `maxAccelRiseMs`
- `maxGyroHighRunMs`
- `capturePeakStrength`
- `strongGyroAxisChangeCount`

### 終了条件

以下のどちらかでキャプチャを終了する。

- 最大キャプチャ時間に達した
- 最小キャプチャ時間を超え、strength がピークから十分落ち、その状態が一定時間続いた

### 無効化

`swingEvidence()` によって、動きがスイングらしいかを確認する。

見ている要素:

- スイング時間
- gyro peak
- accel peak
- accel rise 時間
- 強い gyro が出たか
- capture peak strength
- gyro peak と accel peak の時間差

スコアが低くても、明らかにスイングらしい低スコア動作は表示する。  
ただし、100点が連続しないように、低スコア救済は強めに絞る。

低スコア救済の条件:

- スイング時間が十分ある
- `capturePeakStrength` が十分大きい
- gyro peak が十分ある
- accel peak が十分ある
- accel rise 時間が十分ある

---

## スコア計算

現在のスコアは `scoreFromPeaks()` で計算する。

構成:

```cpp
score = gyroRiseScore();
score += gyroPeakScore();
score += strengthScore();
score += accelAreaScore();
score = score * peakDeltaPct() / 100;
score = score * smoothnessPct() / 100;
score = score * swingQualityPct() / 100;
score = score * kFinalScorePct / 100;
score = displayScoreFromMotionScore(score);
```

整数演算中心で、float は使わない。

### gyroRiseScore

回転の立ち上がりを見る。

- 早すぎるものは衝撃やノイズ寄りとして弱める
- 良い時間帯は高評価
- 遅すぎる立ち上がりは低評価

「一気に回転が立ち上がる」ことを評価するための項目。

### gyroPeakScore

角速度ピークを見る。

- 一定以下は 0
- 閾値を超えた分を平方根でスコア化する

ピーク角速度は重要だが、これだけで高得点になりすぎないようにしている。

### strengthScore

`capturePeakStrength` を見る。

gyro magnitude と dynamic accel を合成した、スイング全体の強さに近い指標。  
フォームに関わらず、思いっきり振ったことは基礎点として一定評価する。

これは上限付きの救済ボーナスではなく、`gyroRiseScore`、`gyroPeakScore`、`accelAreaScore` と同じ基礎点の一部として扱う。

### accelAreaScore

加速度ピークと加速上昇時間を見る。

```cpp
sqrt((accelPeakMg - offset) * maxAccelRiseMs)
```

瞬間的な衝撃だけでなく、加速度が立ち上がってピークへ向かう流れがあるかを見る。  
現在の Dream-1 ではかなり重要な項目。

### peakDeltaPct

gyro peak と accel peak の時間差を見る。

考え方:

- gyro peak が先に来る
- その後、少し遅れて accel peak が来る
- 同時すぎる場合は手元だけの入力や衝撃っぽい動きとして減点
- accel が先行する場合も減点
- 遅れすぎる場合も減点

現在の補正:

```text
delta < 0      75%
0..10ms        82%
10..20ms       82% -> 90%
20..70ms       110%
70..140ms      102%
140..220ms     95% -> 88%
220ms以上      88%
```

この項目は Dream-1 の思想にかなり近い。  
ただし個人差、バット長さ、装着位置で変わるため、補正幅は極端にしすぎない。

### smoothnessPct

スイング時間に対して加速度がピークへ向かって立ち上がった時間を見る。

- 加速上昇が短すぎると減点
- 適度に鋭く立ち上がると少し加点
- 上昇時間が長すぎるスイングは減点

`maxAccelRiseMs` は固定閾値以上の時間ではなく、dynamic accel が立ち上がってからピーク後に減少へ転じるまでの時間として記録する。  
ノイズで1サンプルだけ下がっても減少扱いにしないよう、小さい変化は無視し、連続した減少で判定する。

### swingQualityPct

ドアスイングを直接検出するものではない。  
「遠回り、長回し、軸ブレっぽい品質低下」を弱く補正する項目。

見る値:

- `gyroPeakTimeMs`
- `maxGyroHighRunMs`
- `strongGyroAxisChangeCount`

意味:

- gyro peak が遅すぎると減点
- 高速状態が長く続きすぎると減点
- 強い gyro 区間で dominant axis が何度も変わると減点

補正下限は高めに保ち、子供が普通に振ったときに点が出にくくなりすぎないようにする。

---

## 表示スコア

内部スコアはそのまま表示せず、`displayScoreFromMotionScore()` で表示用カーブに通す。

目的:

- 低〜中スコア帯でも変化が分かるようにする
- 999 は簡単に出ないようにする
- 子供が普通に振っても極端に点が出にくくならないようにする

有効スイングとして扱うが内部スコアが低い場合は、`displayedAcceptedScore()` で最低表示を `100` にする。

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
- `peakDeltaPct()` の時間帯
- `accelAreaScore()` の offset
- `swingQualityPct()` の補正下限
- 低スコア救済条件

チューニング時の注意:

- 「無反応」と「100連発」は同じ対策で悪化しやすい
- 小さい動きの誤検出を減らしつつ、大ぶり低スコアは表示したい
- 999 は「速いだけ」では出ないようにする
- 子供が普通に振ったときに点が出なさすぎる状態は避ける
- 装着位置やバット長さで値は変わるため、補正は強くしすぎない

---
