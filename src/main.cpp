#include <Arduino.h>

#include "buzzer.h"
#include "display.h"
#include "imu.h"

namespace {

enum class RunMode : uint8_t {
  Calibrate,
  StartCue,
  Measuring,
  ShowingScore,
};

const uint16_t kGyroCalibrationWindowMs = 600;
const uint16_t kStartWindowMs = 1000;
const uint16_t kPostStartMeasureMs = 3000;
const uint16_t kScoreDisplayMs = 3000;
const uint16_t kBaselineTrackDeltaMg = 120;

const uint16_t kSwingStartStrength = 1400;
const uint16_t kAccelRunThresholdMg = 350;
const uint16_t kAccelRunScoreMaxMs = 450;

const uint16_t kGyroScoreOffsetRaw = 700;
const uint16_t kAccelScoreOffsetMg = 300;
const uint8_t kGyroScoreScale = 3;
const uint8_t kAccelScoreScale = 2;
const uint8_t kAccelRunScoreDivisor = 3;
const uint8_t kFinalScorePct = 85;
const uint16_t kScoreCurveKnee = 500;
const uint16_t kScoreCurveKneeOutput = 300;
const uint8_t kScoreCurveLowPct = 60;
const uint8_t kScoreCurveHighPct = 160;

RunMode runMode = RunMode::Calibrate;
uint32_t calibrationUntilMs = 0;
uint32_t measureStartedMs = 0;
uint32_t startWindowUntilMs = 0;
uint32_t swingStartedMs = 0;
uint32_t scoreUntilMs = 0;

int32_t gyroXSum = 0;
int32_t gyroYSum = 0;
int32_t gyroZSum = 0;
uint32_t accelSumMg = 0;
uint16_t calibrationSamples = 0;
int16_t gyroBaselineX = 0;
int16_t gyroBaselineY = 0;
int16_t gyroBaselineZ = 0;
uint16_t accelBaselineMg = 1000;

uint16_t gyroPeakRaw = 0;
uint16_t accelPeakMg = 0;
uint16_t accelRunMs = 0;
uint16_t maxAccelRunMs = 0;
uint32_t lastMeasureSampleMs = 0;
bool swingStarted = false;

uint32_t squareInt16(int16_t value) {
  const int32_t wideValue = value;
  return static_cast<uint32_t>(wideValue * wideValue);
}

uint16_t isqrt32(uint32_t value) {
  uint32_t bit = 1UL << 30;
  uint32_t result = 0;

  while (bit > value) {
    bit >>= 2;
  }

  while (bit != 0) {
    if (value >= result + bit) {
      value -= result + bit;
      result = (result >> 1) + bit;
    } else {
      result >>= 1;
    }
    bit >>= 2;
  }

  return static_cast<uint16_t>(result);
}

uint16_t magnitudeRaw(int16_t x, int16_t y, int16_t z) {
  return isqrt32(squareInt16(x) + squareInt16(y) + squareInt16(z));
}

uint16_t absDiff16(uint16_t a, uint16_t b) {
  return a > b ? a - b : b - a;
}

void resetCalibration() {
  gyroXSum = 0;
  gyroYSum = 0;
  gyroZSum = 0;
  accelSumMg = 0;
  calibrationSamples = 0;
}

void finishCalibration() {
  if (calibrationSamples != 0) {
    gyroBaselineX = static_cast<int16_t>(gyroXSum / calibrationSamples);
    gyroBaselineY = static_cast<int16_t>(gyroYSum / calibrationSamples);
    gyroBaselineZ = static_cast<int16_t>(gyroZSum / calibrationSamples);
    accelBaselineMg = static_cast<uint16_t>(accelSumMg / calibrationSamples);
  }
  Display::off();
  runMode = RunMode::StartCue;
}

void resetMeasurement() {
  gyroPeakRaw = 0;
  accelPeakMg = 0;
  accelRunMs = 0;
  maxAccelRunMs = 0;
  lastMeasureSampleMs = 0;
  swingStarted = false;
  swingStartedMs = 0;
}

void startMeasurementCue() {
  Display::off();
  Buzzer::beep(2, micros());
  resetMeasurement();
  measureStartedMs = millis();
  startWindowUntilMs = measureStartedMs + kStartWindowMs;
  runMode = RunMode::Measuring;
}

uint16_t scoreFromPeaks() {
  uint32_t gyroInput = 0;
  uint32_t accelInput = 0;

  if (gyroPeakRaw > kGyroScoreOffsetRaw) {
    gyroInput = gyroPeakRaw - kGyroScoreOffsetRaw;
  }
  if (accelPeakMg > kAccelScoreOffsetMg) {
    accelInput = accelPeakMg - kAccelScoreOffsetMg;
  }

  const uint32_t gyroScore = isqrt32(gyroInput) * kGyroScoreScale;
  const uint32_t accelScore = isqrt32(accelInput) * kAccelScoreScale;
  uint32_t accelRunScore = maxAccelRunMs / kAccelRunScoreDivisor;
  const uint32_t accelRunScoreMax = kAccelRunScoreMaxMs / kAccelRunScoreDivisor;
  if (accelRunScore > accelRunScoreMax) {
    accelRunScore = accelRunScoreMax;
  }
  uint32_t score = gyroScore + accelScore;
  score += accelRunScore;
  score = (score * kFinalScorePct) / 100UL;
  if (score <= kScoreCurveKnee) {
    score = (score * kScoreCurveLowPct) / 100UL;
  } else {
    score = kScoreCurveKneeOutput +
            ((score - kScoreCurveKnee) * kScoreCurveHighPct) / 100UL;
  }
  if (score > 999) {
    score = 999;
  }
  return static_cast<uint16_t>(score);
}

void finishMeasurement(uint32_t nowMs) {
  const uint16_t score = scoreFromPeaks();
  Display::showNumber(score, nowMs, kScoreDisplayMs);
  scoreUntilMs = nowMs + kScoreDisplayMs;
  runMode = RunMode::ShowingScore;
}

}  // namespace

void setup() {
  Buzzer::begin();
  Display::begin();
  Imu::begin();

  resetCalibration();
  calibrationUntilMs = millis() + kGyroCalibrationWindowMs;
  Display::showNumber(888, millis(), kGyroCalibrationWindowMs);
  runMode = RunMode::Calibrate;
}

void loop() {
  const uint32_t nowMs = millis();
  const uint32_t nowUs = micros();

  Buzzer::update(nowUs);
  if (Buzzer::isActive()) {
    return;
  }
  Display::update(nowMs);

  if (runMode == RunMode::StartCue) {
    startMeasurementCue();
    return;
  }

  if (runMode == RunMode::ShowingScore) {
    if (static_cast<int32_t>(nowMs - scoreUntilMs) >= 0) {
      runMode = RunMode::StartCue;
    }
    return;
  }

  const uint16_t accelMagnitudeMg = Imu::readAccelMagnitudeMg();

  int16_t gyroXRaw = 0;
  int16_t gyroYRaw = 0;
  int16_t gyroZRaw = 0;
  Imu::readGyroAxesRaw(gyroXRaw, gyroYRaw, gyroZRaw);

  if (runMode == RunMode::Calibrate) {
    if (calibrationSamples < 32767) {
      gyroXSum += gyroXRaw;
      gyroYSum += gyroYRaw;
      gyroZSum += gyroZRaw;
      accelSumMg += accelMagnitudeMg;
      ++calibrationSamples;
    }
    if (static_cast<int32_t>(nowMs - calibrationUntilMs) >= 0) {
      finishCalibration();
    }
    return;
  }

  const int16_t dynamicGyroXRaw = static_cast<int16_t>(gyroXRaw - gyroBaselineX);
  const int16_t dynamicGyroYRaw = static_cast<int16_t>(gyroYRaw - gyroBaselineY);
  const int16_t dynamicGyroZRaw = static_cast<int16_t>(gyroZRaw - gyroBaselineZ);
  const uint16_t gyroMagnitudeRaw =
      magnitudeRaw(dynamicGyroXRaw, dynamicGyroYRaw, dynamicGyroZRaw);

  const uint16_t dynamicAccelMg = absDiff16(accelMagnitudeMg, accelBaselineMg);
  if (dynamicAccelMg < kBaselineTrackDeltaMg) {
    const int32_t baselineDeltaMg =
        static_cast<int32_t>(accelMagnitudeMg) - static_cast<int32_t>(accelBaselineMg);
    accelBaselineMg = static_cast<uint16_t>(
        static_cast<int32_t>(accelBaselineMg) + (baselineDeltaMg >> 5));
  }

  if (runMode != RunMode::Measuring) {
    return;
  }

  const uint32_t strength =
      static_cast<uint32_t>(gyroMagnitudeRaw) +
      static_cast<uint32_t>(dynamicAccelMg) * 4UL;

  if (!swingStarted && strength >= kSwingStartStrength) {
    swingStarted = true;
    swingStartedMs = nowMs;
    lastMeasureSampleMs = nowMs;
  }

  if (!swingStarted && static_cast<int32_t>(nowMs - startWindowUntilMs) >= 0) {
    Buzzer::beep(1, micros());
    finishMeasurement(nowMs);
    return;
  }

  if (!swingStarted) {
    return;
  }

  const uint16_t elapsedMs = static_cast<uint16_t>(nowMs - swingStartedMs);
  const uint16_t sampleDeltaMs =
      lastMeasureSampleMs == 0 ? 0 : static_cast<uint16_t>(nowMs - lastMeasureSampleMs);
  lastMeasureSampleMs = nowMs;

  if (gyroMagnitudeRaw > gyroPeakRaw) {
    gyroPeakRaw = gyroMagnitudeRaw;
  }
  if (dynamicAccelMg > accelPeakMg) {
    accelPeakMg = dynamicAccelMg;
  }
  if (dynamicAccelMg >= kAccelRunThresholdMg) {
    const uint32_t nextRunMs = static_cast<uint32_t>(accelRunMs) + sampleDeltaMs;
    accelRunMs = nextRunMs > 65535 ? 65535 : static_cast<uint16_t>(nextRunMs);
    if (accelRunMs > maxAccelRunMs) {
      maxAccelRunMs = accelRunMs;
    }
  } else {
    accelRunMs = 0;
  }

  if (elapsedMs >= kPostStartMeasureMs) {
    Buzzer::beep(1, micros());
    finishMeasurement(nowMs);
  }
}
