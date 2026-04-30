#include <Arduino.h>
#include <megaTinyCore.h>

#include "buzzer.h"
#include "display.h"
#include "imu.h"

namespace {

enum class RunMode : uint8_t {
  Calibrate,
  Monitor,
  Capturing,
  ShowingScore,
  Cooldown,
};

const uint16_t kGyroCalibrationWindowMs = 1000;
const uint16_t kCaptureMaxMs = 900;
const uint16_t kCaptureMinMs = 80;
const uint16_t kMinAcceptedSwingDurationMs = 160;
const uint16_t kCaptureEndQuietMs = 40;
const uint16_t kCaptureEndDropPct = 70;
const uint16_t kCaptureDiscardCooldownMs = 120;
const uint16_t kCaptureStartStrength = 900;
const uint16_t kCaptureStartGyroRaw = 600;
const uint16_t kCaptureRestartStrength = 1800;
const uint16_t kMinAcceptedScore = 200;
const uint16_t kMinDisplayedAcceptedScore = 100;
const uint16_t kScoreDisplayMs = 2000;
const uint8_t kMilestoneSwingInterval = 100;
const uint16_t kBaselineTrackDeltaMg = 120;
const uint16_t kBatteryFullMv = 3000;
const uint16_t kBatteryEmptyMv = 2600;

const uint16_t kAccelRunThresholdMg = 350;

const uint16_t kNoTimeMs = 65535;
const uint16_t kGyroRiseThresholdRaw = 900;
const uint16_t kGyroRiseTooFastMs = 15;
const uint16_t kGyroRiseGoodMs = 35;
const uint16_t kGyroRiseLateMs = 180;
const uint16_t kGyroRiseSlowMs = 320;
const uint16_t kGyroRiseScoreWeak = 60;
const uint16_t kGyroRiseScoreGood = 150;
const uint16_t kGyroPeakScoreOffsetRaw = 700;
const uint8_t kGyroPeakScoreScale = 5;
const uint16_t kAccelAreaScoreOffsetMg = 250;
const uint8_t kAccelAreaScoreScale = 2;
const uint8_t kFinalScorePct = 90;
const uint16_t kDisplayCurveLowInput = 250;
const uint16_t kDisplayCurveLowOutput = 120;
const uint16_t kDisplayCurveMidInput = 350;
const uint16_t kDisplayCurveMidOutput = 300;
const uint16_t kDisplayCurveSolidInput = 450;
const uint16_t kDisplayCurveSolidOutput = 430;
const uint16_t kDisplayCurveStrongInput = 600;
const uint16_t kDisplayCurveStrongOutput = 620;
const uint16_t kDisplayCurveExcellentInput = 800;
const uint16_t kDisplayCurveExcellentOutput = 820;
const uint16_t kDisplayCurveProInput = 1000;
const uint16_t kDisplayCurveProOutput = 999;

RunMode runMode = RunMode::Calibrate;
uint32_t calibrationUntilMs = 0;
uint32_t swingStartedMs = 0;
uint32_t scoreUntilMs = 0;
uint32_t cooldownUntilMs = 0;

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
uint16_t gyroPeakTimeMs = 0;
uint16_t accelPeakTimeMs = 0;
uint16_t firstGyroStrongTimeMs = kNoTimeMs;
uint16_t bestScore = 0;
uint16_t swingCount = 0;
uint32_t lastMeasureSampleMs = 0;
uint32_t lastSwingMotionMs = 0;
uint16_t capturePeakStrength = 0;
uint32_t captureQuietStartedMs = 0;
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

uint16_t saturateToUint16(uint32_t value) {
  return value > 65535 ? 65535 : static_cast<uint16_t>(value);
}

uint8_t batteryPercentFromMillivolts(uint16_t millivolts) {
  if (millivolts >= kBatteryFullMv) {
    return 100;
  }
  if (millivolts <= kBatteryEmptyMv) {
    return 0;
  }

  const uint32_t spanMv = kBatteryFullMv - kBatteryEmptyMv;
  const uint32_t aboveEmptyMv = millivolts - kBatteryEmptyMv;
  return static_cast<uint8_t>((aboveEmptyMv * 100UL + (spanMv / 2)) / spanMv);
}

uint16_t displayScoreFromMotionScore(uint32_t score) {
  if (score <= kDisplayCurveLowInput) {
    return static_cast<uint16_t>(
        (score * kDisplayCurveLowOutput) / kDisplayCurveLowInput);
  }
  if (score <= kDisplayCurveMidInput) {
    const uint32_t inputSpan = kDisplayCurveMidInput - kDisplayCurveLowInput;
    const uint32_t outputSpan = kDisplayCurveMidOutput - kDisplayCurveLowOutput;
    return static_cast<uint16_t>(
        kDisplayCurveLowOutput +
        ((score - kDisplayCurveLowInput) * outputSpan) / inputSpan);
  }
  if (score <= kDisplayCurveSolidInput) {
    const uint32_t inputSpan = kDisplayCurveSolidInput - kDisplayCurveMidInput;
    const uint32_t outputSpan = kDisplayCurveSolidOutput - kDisplayCurveMidOutput;
    return static_cast<uint16_t>(
        kDisplayCurveMidOutput +
        ((score - kDisplayCurveMidInput) * outputSpan) / inputSpan);
  }
  if (score <= kDisplayCurveStrongInput) {
    const uint32_t inputSpan = kDisplayCurveStrongInput - kDisplayCurveSolidInput;
    const uint32_t outputSpan = kDisplayCurveStrongOutput - kDisplayCurveSolidOutput;
    return static_cast<uint16_t>(
        kDisplayCurveSolidOutput +
        ((score - kDisplayCurveSolidInput) * outputSpan) / inputSpan);
  }
  if (score <= kDisplayCurveExcellentInput) {
    const uint32_t inputSpan = kDisplayCurveExcellentInput - kDisplayCurveStrongInput;
    const uint32_t outputSpan = kDisplayCurveExcellentOutput - kDisplayCurveStrongOutput;
    return static_cast<uint16_t>(
        kDisplayCurveStrongOutput +
        ((score - kDisplayCurveStrongInput) * outputSpan) / inputSpan);
  }
  if (score <= kDisplayCurveProInput) {
    const uint32_t inputSpan = kDisplayCurveProInput - kDisplayCurveExcellentInput;
    const uint32_t outputSpan = kDisplayCurveProOutput - kDisplayCurveExcellentOutput;
    return static_cast<uint16_t>(
        kDisplayCurveExcellentOutput +
        ((score - kDisplayCurveExcellentInput) * outputSpan) / inputSpan);
  }
  return kDisplayCurveProOutput;
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
  runMode = RunMode::Monitor;
}

void resetMeasurement() {
  gyroPeakRaw = 0;
  accelPeakMg = 0;
  accelRunMs = 0;
  maxAccelRunMs = 0;
  gyroPeakTimeMs = 0;
  accelPeakTimeMs = 0;
  firstGyroStrongTimeMs = kNoTimeMs;
  lastMeasureSampleMs = 0;
  lastSwingMotionMs = 0;
  capturePeakStrength = 0;
  captureQuietStartedMs = 0;
  swingStarted = false;
  swingStartedMs = 0;
}

void startCapture(uint32_t nowMs, uint16_t strength) {
  Display::off();
  resetMeasurement();
  swingStarted = true;
  swingStartedMs = nowMs;
  lastMeasureSampleMs = nowMs;
  lastSwingMotionMs = nowMs;
  capturePeakStrength = strength;
  captureQuietStartedMs = 0;
  runMode = RunMode::Capturing;
}

uint16_t scoreFromRange(
    uint16_t value,
    uint16_t lowInput,
    uint16_t highInput,
    uint16_t lowOutput,
    uint16_t highOutput) {
  if (value <= lowInput) {
    return lowOutput;
  }
  if (value >= highInput) {
    return highOutput;
  }
  const uint32_t inputOffset = value - lowInput;
  const uint32_t inputSpan = highInput - lowInput;
  if (highOutput >= lowOutput) {
    return static_cast<uint16_t>(
        lowOutput + ((inputOffset * (highOutput - lowOutput)) / inputSpan));
  }
  return static_cast<uint16_t>(
      lowOutput - ((inputOffset * (lowOutput - highOutput)) / inputSpan));
}

uint16_t gyroRiseScore() {
  const uint16_t riseMs =
      firstGyroStrongTimeMs != kNoTimeMs ? firstGyroStrongTimeMs : gyroPeakTimeMs;
  if (riseMs < kGyroRiseTooFastMs) {
    return kGyroRiseScoreWeak;
  }
  if (riseMs < kGyroRiseGoodMs) {
    return scoreFromRange(
        riseMs, kGyroRiseTooFastMs, kGyroRiseGoodMs, 90, kGyroRiseScoreGood);
  }
  if (riseMs <= kGyroRiseLateMs) {
    return kGyroRiseScoreGood;
  }
  if (riseMs < kGyroRiseSlowMs) {
    return scoreFromRange(
        riseMs, kGyroRiseLateMs, kGyroRiseSlowMs, kGyroRiseScoreGood, 80);
  }
  return kGyroRiseScoreWeak;
}

uint16_t gyroPeakScore() {
  if (gyroPeakRaw <= kGyroPeakScoreOffsetRaw) {
    return 0;
  }
  return isqrt32(gyroPeakRaw - kGyroPeakScoreOffsetRaw) * kGyroPeakScoreScale;
}

uint16_t accelAreaScore() {
  if (accelPeakMg <= kAccelAreaScoreOffsetMg || maxAccelRunMs == 0) {
    return 0;
  }
  const uint32_t effectiveAccelMg = accelPeakMg - kAccelAreaScoreOffsetMg;
  const uint32_t area = effectiveAccelMg * maxAccelRunMs;
  return isqrt32(area) * kAccelAreaScoreScale;
}

uint8_t peakDeltaPct() {
  const int16_t deltaPeakMs =
      static_cast<int16_t>(accelPeakTimeMs) - static_cast<int16_t>(gyroPeakTimeMs);
  if (deltaPeakMs < 0) {
    return 80;
  }
  if (deltaPeakMs < 20) {
    return 95;
  }
  if (deltaPeakMs <= 80) {
    return 110;
  }
  if (deltaPeakMs <= 180) {
    return 100;
  }
  return 90;
}

uint8_t smoothnessPct(uint16_t swingDurationMs) {
  if (swingDurationMs == 0) {
    return 85;
  }
  const uint16_t accelRunRatioPct =
      static_cast<uint16_t>((static_cast<uint32_t>(maxAccelRunMs) * 100UL) /
                            swingDurationMs);
  if (accelRunRatioPct < 8) {
    return 85;
  }
  if (accelRunRatioPct < 25) {
    return 100;
  }
  return 108;
}

uint16_t activeSwingDurationMs(uint32_t nowMs) {
  const uint32_t endMs = lastSwingMotionMs != 0 ? lastSwingMotionMs : nowMs;
  uint32_t durationMs = endMs - swingStartedMs;
  if (durationMs > 65535) {
    durationMs = 65535;
  }
  return static_cast<uint16_t>(durationMs);
}

uint16_t scoreFromPeaks(uint16_t swingDurationMs) {
  uint32_t score = gyroRiseScore();
  score += gyroPeakScore();
  score += accelAreaScore();
  score = (score * peakDeltaPct()) / 100UL;
  score = (score * smoothnessPct(swingDurationMs)) / 100UL;
  score = (score * kFinalScorePct) / 100UL;
  if (score > kDisplayCurveProInput) {
    score = kDisplayCurveProInput;
  }
  return displayScoreFromMotionScore(score);
}

uint16_t displayedAcceptedScore(uint16_t score) {
  if (score <= kMinAcceptedScore) {
    return kMinDisplayedAcceptedScore;
  }
  const uint32_t inputSpan = kDisplayCurveProOutput - kMinAcceptedScore;
  const uint32_t outputSpan = kDisplayCurveProOutput - kMinDisplayedAcceptedScore;
  return static_cast<uint16_t>(
      kMinDisplayedAcceptedScore +
      ((static_cast<uint32_t>(score) - kMinAcceptedScore) * outputSpan) / inputSpan);
}

void finishMeasurement(uint32_t nowMs, uint16_t score) {
  Display::showNumber(score, nowMs, kScoreDisplayMs);
  scoreUntilMs = nowMs + kScoreDisplayMs;
  runMode = RunMode::ShowingScore;
}

void finishNoSwing() {
  Display::off();
  cooldownUntilMs = millis() + kCaptureDiscardCooldownMs;
  runMode = RunMode::Cooldown;
}

bool isCaptureStartMotion(
    uint32_t strength, uint16_t gyroMagnitudeRaw, uint16_t dynamicAccelMg) {
  return strength >= kCaptureStartStrength &&
         (gyroMagnitudeRaw >= kCaptureStartGyroRaw ||
          dynamicAccelMg >= kAccelRunThresholdMg);
}

void updateCapturePeaks(
    uint16_t gyroMagnitudeRaw,
    uint16_t dynamicAccelMg,
    uint16_t strength,
    uint32_t nowMs) {
  const uint16_t elapsedMs = static_cast<uint16_t>(nowMs - swingStartedMs);
  const uint16_t sampleDeltaMs =
      lastMeasureSampleMs == 0 ? 0 : static_cast<uint16_t>(nowMs - lastMeasureSampleMs);
  lastMeasureSampleMs = nowMs;

  if (gyroMagnitudeRaw > gyroPeakRaw) {
    gyroPeakRaw = gyroMagnitudeRaw;
    gyroPeakTimeMs = elapsedMs;
  }
  if (gyroMagnitudeRaw >= kGyroRiseThresholdRaw && firstGyroStrongTimeMs == kNoTimeMs) {
    firstGyroStrongTimeMs = elapsedMs;
  }
  if (dynamicAccelMg > accelPeakMg) {
    accelPeakMg = dynamicAccelMg;
    accelPeakTimeMs = elapsedMs;
  }
  if (dynamicAccelMg >= kAccelRunThresholdMg) {
    lastSwingMotionMs = nowMs;
    const uint32_t nextRunMs = static_cast<uint32_t>(accelRunMs) + sampleDeltaMs;
    accelRunMs = nextRunMs > 65535 ? 65535 : static_cast<uint16_t>(nextRunMs);
    if (accelRunMs > maxAccelRunMs) {
      maxAccelRunMs = accelRunMs;
    }
  } else {
    accelRunMs = 0;
  }
  if (strength >= kCaptureStartStrength) {
    lastSwingMotionMs = nowMs;
  }
}

bool isCaptureFinished(uint16_t strength, uint32_t nowMs) {
  const uint16_t elapsedMs = static_cast<uint16_t>(nowMs - swingStartedMs);
  if (elapsedMs >= kCaptureMaxMs) {
    return true;
  }
  if (elapsedMs < kCaptureMinMs) {
    return false;
  }

  const uint32_t endThreshold =
      (static_cast<uint32_t>(capturePeakStrength) * kCaptureEndDropPct) / 100UL;
  if (strength <= endThreshold) {
    if (captureQuietStartedMs == 0) {
      captureQuietStartedMs = nowMs;
    }
    return static_cast<uint16_t>(nowMs - captureQuietStartedMs) >= kCaptureEndQuietMs;
  }

  captureQuietStartedMs = 0;
  return false;
}

void finishCapture(uint32_t nowMs) {
  const uint16_t swingDurationMs = activeSwingDurationMs(nowMs);
  if (swingDurationMs < kMinAcceptedSwingDurationMs) {
    finishNoSwing();
    return;
  }

  const uint16_t score = scoreFromPeaks(swingDurationMs);
  if (score <= kMinAcceptedScore) {
    finishNoSwing();
    return;
  }

  const uint16_t displayScore = displayedAcceptedScore(score);
  const bool newBest = displayScore > bestScore;
  if (newBest) {
    bestScore = displayScore;
  }
  if (swingCount < 999) {
    ++swingCount;
  }
  if (swingCount % kMilestoneSwingInterval == 0) {
    Buzzer::milestoneBeep(micros());
  } else {
    Buzzer::beep(newBest ? 3 : 1, micros());
  }
  finishMeasurement(nowMs, displayScore);
}

}  // namespace

void setup() {
  Buzzer::begin();
  Display::begin();
  Imu::begin();

  resetCalibration();
  calibrationUntilMs = millis() + kGyroCalibrationWindowMs;
  Display::showNumber(
      batteryPercentFromMillivolts(readSupplyVoltage()), millis(), kGyroCalibrationWindowMs);
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

  const uint32_t strength =
      static_cast<uint32_t>(gyroMagnitudeRaw) +
      static_cast<uint32_t>(dynamicAccelMg) * 4UL;
  const uint16_t liftStrength = saturateToUint16(strength);

  if (runMode == RunMode::ShowingScore) {
    if (static_cast<int32_t>(nowMs - scoreUntilMs) >= 0) {
      runMode = RunMode::Monitor;
    }
    return;
  }

  if (runMode == RunMode::Cooldown) {
    if (static_cast<int32_t>(nowMs - cooldownUntilMs) >= 0) {
      runMode = RunMode::Monitor;
    }
    return;
  }

  if (runMode == RunMode::Monitor) {
    if (isCaptureStartMotion(strength, gyroMagnitudeRaw, dynamicAccelMg)) {
      startCapture(nowMs, liftStrength);
      updateCapturePeaks(gyroMagnitudeRaw, dynamicAccelMg, liftStrength, nowMs);
    }
    return;
  }

  if (runMode != RunMode::Capturing) {
    return;
  }

  const uint16_t strength16 = liftStrength;
  if (strength16 > capturePeakStrength) {
    if (static_cast<uint32_t>(strength16) >=
        static_cast<uint32_t>(capturePeakStrength) + kCaptureRestartStrength) {
      startCapture(nowMs, strength16);
    } else {
      capturePeakStrength = strength16;
    }
  }
  updateCapturePeaks(gyroMagnitudeRaw, dynamicAccelMg, strength16, nowMs);

  if (isCaptureFinished(strength16, nowMs)) {
    finishCapture(nowMs);
  }
}
