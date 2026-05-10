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
- `firstGyroStrongTimeMs`
- `maxAccelRiseMs`
- `swingAccelAreaMgMs`
- `capturePeakStrength`

### 終了条件

以下のどちらかでキャプチャを終了する。

- 最大キャプチャ時間に達した
- 最小キャプチャ時間を超え、strength がピークから十分落ち、その状態が一定時間続いた

### 無効化

`swingEvidence()` によって、動きがスイングらしいかを確認する。

見ている要素:

- capture peak strength の最低ライン
- スイング時間
- gyro peak
- accel peak
- accel rise 時間
- 強い gyro が出たか
- capture peak strength

`accel rise` はスコアには使わない。  
加速度が一瞬の衝撃ではなく、ある程度立ち上がった動きかを確認するための evidence 専用指標として使う。

低スコア救済は使わない。  
最終スコアが `100` に届いた場合だけスコア表示する。  

---

## スコア計算

現在のスコアは `scoreFromPeaks()` で計算する。

構成:

```cpp
score = gyroPeakScore();          // max 500
score += swingAccelAreaScore();   // max 500
score = min(score, 999);
```

整数演算中心で、float は使わない。

採点に入る条件:

- score が `100` 以上

この条件を満たさない場合は no score。

### gyroPeakScore

角速度ピークを見る。

- 最大 500 点
- gyro full は実測に合わせて `7000 dps`
- IMU の 4000 dps 設定に合わせて `140 mdps/LSB` として換算する
- 7000 dps 以上は 500 点に clamp する

考え方:

- MLB Statcast では 75 mph 以上を fast swing として扱う
- MLB 上位選手の平均 bat speed は 80 mph 前後に達する
- bat speed 80〜85 mph を sweet spot 半径およそ 0.75 m で角速度換算すると約 2700〜2900 dps
- ただし Dream-1 は単一軸ではなく3軸合成の `gyroMagnitudeRaw` を使うため、単純な角速度換算より大きめに出る
- 3000〜4500 dps では子供や軽めのスイングでも 500 点に届きやすかったため、Dream-1 の実測レンジに合わせて `7000 dps` を使う
- 診断時には、7000 dps 満点でも強いスイングで Gyro 側が約400点まで出た
- この値は実測ベースの仮置き。上手い人で Gyro 側が簡単に 500 点へ張り付く場合はさらに上げる候補がある

### swingAccelAreaScore

回転を伴うキャプチャ中に乗った dynamic accel の積算を見る。

```cpp
area = sum((dynamicAccelMg - offset) * dt)
score = area / fullArea * 500
```

手首だけの一瞬の入力ではなく、スイング中に加速度が乗って続いたかを見る。  
当初は「最終 gyro peak 後のみ」を積算する方針だったが、実機では最終 gyro peak 後の加速度がほぼ残らず `0` になりやすかったため、現在はキャプチャ中の offset 超過分を積算する。

`offset` は `1000 mg`。  
小さい揺れ、構え、ぶらぶらを積算しにくくしつつ、普通のスイングが `0` になりにくい値として実測から置いている。

`fullArea` は `300000 mg*ms`。  
これは公開データから直接導いた物理定数ではなく、Dream-1 の実測ベースの仮置き。  
診断時には、かなり全力のスイングで `swingAccelAreaMgMs / 1000` が約 `216`、つまり約 `216000 mg*ms` 程度だった。  
そのため、子供や一般ユーザーの強いスイングで飽和しにくく、上手い人なら上限に近づく余白を残す値として `300000 mg*ms` を採用している。

今後、上手い選手や体格の大きいユーザーで簡単に SwingAccel 側が 500 点に張り付く場合は、`fullArea` を `450000〜600000 mg*ms` 程度へ上げる候補がある。

### スコアに使わない評価要素

以下は現在のスコア計算には使わない。

- `gyroRiseScore()`
- `strengthScore()`
- `peakDeltaPct()`
- `peakPositionPct()`
- `smoothnessPct()`
- `swingQualityPct()`
- `accelAreaScore()`
- `maxGyroHighRunMs`
- `strongGyroAxisChangeCount`
- `maxAccelRiseMs`
- `firstGyroStrongTimeMs`
- `capturePeakStrength`

ただし、`maxAccelRiseMs`、`firstGyroStrongTimeMs`、`capturePeakStrength` はスイング成立判定の evidence として使う。

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

`scoreFromPeaks()` が返すスコアを、そのまま表示、平均、ベスト更新、ブザー判定に使う。

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

チューニング時の注意:

- 「無反応」と「100連発」は同じ対策で悪化しやすい
- 小さい動きの誤検出を減らしつつ、大ぶり低スコアは表示したい
- 999 は「速いだけ」では出ないようにする
- 子供が普通に振ったときに点が出なさすぎる状態は避ける
- 装着位置やバット長さで値は変わるため、補正は強くしすぎない

---
