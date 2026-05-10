#include <Arduino.h>
#include <avr/sleep.h>
#include <megaTinyCore.h>

#include "buzzer.h"
#include "display.h"
#include "imu.h"
#include "tap.h"

namespace {

enum class RunMode : uint8_t {
  Calibrate,
  Monitor,
  Capturing,
  ShowingScore,
  Cooldown,
};

enum class TapStatsStage : uint8_t {
  None,
  Average,
  Best,
};

const uint16_t kGyroCalibrationWindowMs = 1000;
const uint16_t kCaptureMaxMs = 900;
const uint16_t kCaptureMinMs = 80;
const uint16_t kMinAcceptedSwingDurationMs = 160;
const uint16_t kShortSwingDurationMs = 80;
const uint16_t kCaptureEndQuietMs = 40;
const uint16_t kCaptureEndDropPct = 70;
const uint16_t kCaptureDiscardCooldownMs = 120;
const uint16_t kTapMuteAfterScoreMs = 250;
const uint16_t kTapMuteAfterStartupMs = 1000;
const uint16_t kTapAcceptMuteMs = 80;
const uint8_t kTapPollMs = 50;
const uint8_t kIntStallClearMs = 25;
const uint16_t kSingleTapConfirmMs = 300;
const uint16_t kDoubleTapMinGapMs = 30;
const uint16_t kCaptureStartStrength = 2400;
const uint16_t kCaptureStartGyroRaw = 900;
const uint16_t kCaptureRestartStrength = 1800;
const uint16_t kPreCaptureQuietMs = 70;
const uint8_t kMinSwingEvidence = 6;
const uint16_t kMinDisplayScore = 100;
const uint16_t kScoreDisplayMs = 2000;
const uint16_t kTapStatsDisplayMs = 1000;
const uint16_t kTapDisplayMs = 1400;
const uint8_t kMilestoneSwingInterval = 50;
const uint16_t kBaselineTrackDeltaMg = 120;
const uint16_t kBatteryFullMv = 3000;
const uint16_t kBatteryEmptyMv = 2600;
const uint32_t kAutoSleepIdleMs = 300000UL;

const uint16_t kCaptureStartAccelMg = 1800;
const uint16_t kActivityStrengthThreshold = 650;

const uint16_t kNoTimeMs = 65535;
const uint16_t kAccelRiseStartMg = 700;
const uint16_t kAccelTrendNoiseMg = 140;
const uint8_t kAccelTrendFallSamples = 2;
const uint16_t kGyroRiseThresholdRaw = 900;
const uint16_t kGyroRiseTooFastMs = 15;
const uint16_t kGyroRiseGoodMs = 35;
const uint16_t kGyroMdpsPerLsb = 140;
const uint16_t kGyroPeakFullDps = 7000;
const uint16_t kGyroPeakScoreMax = 500;
const uint16_t kSwingAccelAreaScoreOffsetMg = 1000;
const uint32_t kSwingAccelAreaFullMgMs = 300000UL;
const uint16_t kSwingAccelAreaScoreMax = 500;
const uint16_t kInternalScoreMax = 999;
const uint16_t kMinScore = 100;

RunMode runMode = RunMode::Calibrate;
uint32_t calibrationUntilMs = 0;
uint32_t swingStartedMs = 0;
uint32_t scoreUntilMs = 0;
uint32_t tapStatsUntilMs = 0;
uint32_t cooldownUntilMs = 0;
uint32_t tapMutedUntilMs = 0;
uint32_t lastTapPollMs = 0;
uint32_t singleTapConfirmAtMs = 0;
uint32_t lastSingleTapEventMs = 0;
uint32_t motionCandidateStartedMs = 0;
uint32_t motionCandidateLastMs = 0;
uint32_t lastActivityMs = 0;
uint32_t lastImuInterruptMs = 0;
uint16_t latestGyroMagnitudeRaw = 0;

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
uint16_t accelRiseMs = 0;
uint16_t maxAccelRiseMs = 0;
uint16_t accelTrendPeakMg = 0;
uint16_t firstGyroStrongTimeMs = kNoTimeMs;
uint32_t swingAccelAreaMgMs = 0;
uint8_t accelTrendFallCount = 0;
uint16_t bestScore = 0;
uint16_t swingCount = 0;
uint32_t scoreTotal = 0;
uint16_t scoreSampleCount = 0;
uint32_t lastMeasureSampleMs = 0;
uint32_t lastSwingMotionMs = 0;
uint16_t capturePeakStrength = 0;
uint32_t captureQuietStartedMs = 0;
bool swingStarted = false;
TapStatsStage tapStatsStage = TapStatsStage::None;

void enterFinalSleep() {
  Display::off();
  Buzzer::off();
  Imu::enterSleepMode();

  set_sleep_mode(SLEEP_MODE_PWR_DOWN);
  sleep_enable();
  noInterrupts();
  for (;;) {
    sleep_cpu();
  }
}

void enterIdleSleep() {
  set_sleep_mode(SLEEP_MODE_IDLE);
  sleep_enable();
  noInterrupts();
  interrupts();
  sleep_cpu();
  sleep_disable();
}

bool isIdleTimedOut(uint32_t nowMs) {
  return static_cast<int32_t>(nowMs - (lastActivityMs + kAutoSleepIdleMs)) >= 0;
}

void clearPendingSingleTap() {
  singleTapConfirmAtMs = 0;
  lastSingleTapEventMs = 0;
}

void clearPendingTapEvents() {
  singleTapConfirmAtMs = 0;
  lastSingleTapEventMs = 0;
}

void clearTapStatsDisplay() {
  tapStatsStage = TapStatsStage::None;
  tapStatsUntilMs = 0;
}

bool isTapPollDue(uint32_t nowMs) {
  return static_cast<uint16_t>(nowMs - lastTapPollMs) >= kTapPollMs;
}

void queueSingleTap(uint32_t nowMs) {
  singleTapConfirmAtMs = nowMs + kSingleTapConfirmMs;
}

bool isSingleTapConfirmed(uint32_t nowMs) {
  return singleTapConfirmAtMs != 0 &&
         static_cast<int32_t>(nowMs - singleTapConfirmAtMs) >= 0;
}

uint16_t averageScoreOrZero() {
  if (scoreSampleCount == 0) {
    return 0;
  }
  return static_cast<uint16_t>(
      (scoreTotal + (scoreSampleCount / 2UL)) / scoreSampleCount);
}

void showAverageThenBest(uint32_t nowMs) {
  clearPendingTapEvents();
  lastActivityMs = nowMs;
  tapStatsStage = TapStatsStage::Average;
  tapStatsUntilMs = nowMs + kTapStatsDisplayMs;
  tapMutedUntilMs = nowMs + (kTapStatsDisplayMs * 2U) + kTapAcceptMuteMs;
  scoreUntilMs = nowMs + (kTapStatsDisplayMs * 2U);
  Display::showNumber(averageScoreOrZero(), nowMs, kTapStatsDisplayMs);
  runMode = RunMode::ShowingScore;
}

void updateTapStatsDisplay(uint32_t nowMs) {
  if (tapStatsStage == TapStatsStage::Average &&
      static_cast<int32_t>(nowMs - tapStatsUntilMs) >= 0) {
    tapStatsStage = TapStatsStage::Best;
    tapStatsUntilMs = nowMs + kTapStatsDisplayMs;
    Display::showNumber(bestScore, nowMs, kTapStatsDisplayMs);
    return;
  }

  if (tapStatsStage == TapStatsStage::Best &&
      static_cast<int32_t>(nowMs - tapStatsUntilMs) >= 0) {
    clearTapStatsDisplay();
  }
}

void updateDisplayService() {
  const uint32_t nowMs = millis();
  updateTapStatsDisplay(nowMs);
  Display::update(nowMs);
}

void showSwingCount(uint32_t nowMs) {
  clearPendingTapEvents();
  clearTapStatsDisplay();
  lastActivityMs = nowMs;
  Display::showNumber(swingCount, nowMs, kTapDisplayMs);
  scoreUntilMs = nowMs + kTapDisplayMs;
  tapMutedUntilMs = scoreUntilMs + kTapAcceptMuteMs;
  runMode = RunMode::ShowingScore;
}

bool isInterruptStalled(uint32_t nowMs) {
  return static_cast<uint16_t>(nowMs - lastImuInterruptMs) >= kIntStallClearMs;
}

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
  tapMutedUntilMs = millis() + kTapMuteAfterStartupMs;
  lastImuInterruptMs = millis();
  lastActivityMs = millis();
  runMode = RunMode::Monitor;
}

void resetMeasurement() {
  gyroPeakRaw = 0;
  accelPeakMg = 0;
  accelRiseMs = 0;
  maxAccelRiseMs = 0;
  accelTrendPeakMg = 0;
  firstGyroStrongTimeMs = kNoTimeMs;
  swingAccelAreaMgMs = 0;
  accelTrendFallCount = 0;
  lastMeasureSampleMs = 0;
  lastSwingMotionMs = 0;
  capturePeakStrength = 0;
  captureQuietStartedMs = 0;
  swingStarted = false;
  swingStartedMs = 0;
  motionCandidateStartedMs = 0;
  motionCandidateLastMs = 0;
}

void startCapture(uint32_t nowMs, uint16_t strength, uint32_t startedMs) {
  Display::off();
  clearPendingTapEvents();
  clearTapStatsDisplay();
  resetMeasurement();
  swingStarted = true;
  swingStartedMs = startedMs;
  lastMeasureSampleMs = nowMs;
  lastSwingMotionMs = nowMs;
  capturePeakStrength = strength;
  captureQuietStartedMs = 0;
  motionCandidateStartedMs = 0;
  motionCandidateLastMs = 0;
  runMode = RunMode::Capturing;
}

uint16_t gyroPeakScore() {
  const uint32_t gyroPeakDps =
      (static_cast<uint32_t>(gyroPeakRaw) * kGyroMdpsPerLsb) / 1000UL;
  const uint32_t clampedDps =
      gyroPeakDps > kGyroPeakFullDps ? kGyroPeakFullDps : gyroPeakDps;
  return static_cast<uint16_t>(
      (clampedDps * kGyroPeakScoreMax) / kGyroPeakFullDps);
}

uint16_t swingAccelAreaScore() {
  const uint32_t clampedArea =
      swingAccelAreaMgMs > kSwingAccelAreaFullMgMs
          ? kSwingAccelAreaFullMgMs
          : swingAccelAreaMgMs;
  return static_cast<uint16_t>(
      (clampedArea * kSwingAccelAreaScoreMax) /
      kSwingAccelAreaFullMgMs);
}

uint16_t activeSwingDurationMs(uint32_t nowMs) {
  const uint32_t endMs = lastSwingMotionMs != 0 ? lastSwingMotionMs : nowMs;
  uint32_t durationMs = endMs - swingStartedMs;
  if (durationMs > 65535) {
    durationMs = 65535;
  }
  return static_cast<uint16_t>(durationMs);
}

uint16_t scoreFromComponents(uint16_t gyroScore, uint16_t accelScore) {
  uint32_t score = gyroScore;
  score += accelScore;
  if (score > kInternalScoreMax) {
    score = kInternalScoreMax;
  }
  return static_cast<uint16_t>(score);
}

uint16_t scoreFromPeaks(uint16_t swingDurationMs) {
  (void)swingDurationMs;
  const uint16_t score =
      scoreFromComponents(gyroPeakScore(), swingAccelAreaScore());
  return score >= kMinScore ? score : 0;
}

void finishMeasurement(uint32_t nowMs, uint16_t score) {
  clearTapStatsDisplay();
  Display::showNumber(score, nowMs, kScoreDisplayMs);
  scoreUntilMs = nowMs + kScoreDisplayMs;
  tapMutedUntilMs = scoreUntilMs + kTapMuteAfterScoreMs;
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
          dynamicAccelMg >= kCaptureStartAccelMg);
}

void updateMotionCandidate(uint32_t strength, uint32_t nowMs) {
  if (strength >= kActivityStrengthThreshold) {
    if (motionCandidateStartedMs == 0) {
      motionCandidateStartedMs = nowMs;
    }
    motionCandidateLastMs = nowMs;
    return;
  }

  if (motionCandidateLastMs != 0 &&
      static_cast<uint16_t>(nowMs - motionCandidateLastMs) >= kPreCaptureQuietMs) {
    motionCandidateStartedMs = 0;
    motionCandidateLastMs = 0;
  }
}

uint32_t captureStartTimeFor(uint32_t nowMs) {
  return motionCandidateStartedMs != 0 ? motionCandidateStartedMs : nowMs;
}

void handleMonitorTapEvent(TapEvent tapEvent, uint32_t nowMs) {
  if (tapEvent == TapEvent::Double) {
    showAverageThenBest(nowMs);
    return;
  }

  if (tapEvent == TapEvent::Single) {
    if (lastSingleTapEventMs != 0 &&
        static_cast<uint16_t>(nowMs - lastSingleTapEventMs) < kDoubleTapMinGapMs) {
      return;
    }
    lastSingleTapEventMs = nowMs;

    if (singleTapConfirmAtMs != 0 &&
        static_cast<int32_t>(singleTapConfirmAtMs - nowMs) > 0) {
      showAverageThenBest(nowMs);
      return;
    }

    if (isSingleTapConfirmed(nowMs)) {
      clearPendingTapEvents();
    }
    queueSingleTap(nowMs);
    return;
  }

  if (isSingleTapConfirmed(nowMs)) {
    clearPendingSingleTap();
    showSwingCount(nowMs);
  }
}

uint8_t swingEvidence(uint16_t swingDurationMs) {
  uint8_t evidence = 0;

  if (swingDurationMs >= kMinAcceptedSwingDurationMs) {
    evidence += 2;
  } else if (swingDurationMs >= kShortSwingDurationMs) {
    evidence += 1;
  }

  if (gyroPeakRaw >= kGyroRiseThresholdRaw) {
    evidence += 2;
  }
  if (accelPeakMg >= kSwingAccelAreaScoreOffsetMg * 2U) {
    evidence += 2;
  } else if (accelPeakMg >= kSwingAccelAreaScoreOffsetMg) {
    evidence += 1;
  }

  if (maxAccelRiseMs >= kGyroRiseGoodMs) {
    evidence += 2;
  } else if (maxAccelRiseMs >= kGyroRiseTooFastMs) {
    evidence += 1;
  }

  if (firstGyroStrongTimeMs != kNoTimeMs) {
    evidence += 1;
  }

  if (capturePeakStrength >= kCaptureRestartStrength) {
    evidence += 1;
  }

  return evidence;
}

void updateAccelRise(uint16_t dynamicAccelMg, uint16_t sampleDeltaMs) {
  if (dynamicAccelMg < kAccelRiseStartMg) {
    accelRiseMs = 0;
    accelTrendPeakMg = dynamicAccelMg;
    accelTrendFallCount = 0;
    return;
  }

  if (accelRiseMs == 0) {
    accelTrendPeakMg = dynamicAccelMg;
    accelTrendFallCount = 0;
  } else if (dynamicAccelMg > accelTrendPeakMg + kAccelTrendNoiseMg) {
    accelTrendPeakMg = dynamicAccelMg;
    accelTrendFallCount = 0;
  } else if (dynamicAccelMg + kAccelTrendNoiseMg < accelTrendPeakMg) {
    if (accelTrendFallCount < 255) {
      ++accelTrendFallCount;
    }
  } else {
    accelTrendFallCount = 0;
  }

  const uint32_t nextRiseMs =
      static_cast<uint32_t>(accelRiseMs) + sampleDeltaMs;
  accelRiseMs =
      nextRiseMs > 65535 ? 65535 : static_cast<uint16_t>(nextRiseMs);
  if (accelRiseMs > maxAccelRiseMs) {
    maxAccelRiseMs = accelRiseMs;
  }

  if (accelTrendFallCount >= kAccelTrendFallSamples) {
    accelRiseMs = 0;
    accelTrendPeakMg = dynamicAccelMg;
    accelTrendFallCount = 0;
  }
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
  }
  if (gyroMagnitudeRaw >= kGyroRiseThresholdRaw && firstGyroStrongTimeMs == kNoTimeMs) {
    firstGyroStrongTimeMs = elapsedMs;
  }
  if (dynamicAccelMg > accelPeakMg) {
    accelPeakMg = dynamicAccelMg;
  }
  if (dynamicAccelMg > kSwingAccelAreaScoreOffsetMg) {
    const uint16_t effectiveAccelMg =
        dynamicAccelMg - kSwingAccelAreaScoreOffsetMg;
    const uint16_t areaMs = sampleDeltaMs == 0 ? 1 : sampleDeltaMs;
    swingAccelAreaMgMs +=
        static_cast<uint32_t>(effectiveAccelMg) * areaMs;
  }
  updateAccelRise(dynamicAccelMg, sampleDeltaMs);
  if (dynamicAccelMg >= kAccelRiseStartMg) {
    lastSwingMotionMs = nowMs;
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
  const uint8_t evidence = swingEvidence(swingDurationMs);
  if (evidence < kMinSwingEvidence) {
    finishNoSwing();
    return;
  }
  const uint16_t score = scoreFromPeaks(swingDurationMs);
  if (score < kMinDisplayScore) {
    finishNoSwing();
    return;
  }

  const uint16_t displayScore = score;
  const uint16_t averageScore =
      scoreSampleCount != 0
          ? static_cast<uint16_t>((scoreTotal + (scoreSampleCount / 2UL)) /
                                  scoreSampleCount)
          : score;
  const bool aboveAverage = score >= averageScore;
  const bool newBest = score > bestScore;
  if (newBest) {
    bestScore = score;
  }
  if (swingCount < 999) {
    ++swingCount;
  }
  if (scoreSampleCount < 65535) {
    ++scoreSampleCount;
    scoreTotal += score;
  }
  if (swingCount % kMilestoneSwingInterval == 0) {
    Buzzer::milestoneBeep(micros());
  } else if (newBest) {
    Buzzer::beep(3, micros());
  } else if (aboveAverage) {
    Buzzer::beep(2, micros());
  } else {
    Buzzer::beep(1, micros());
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
  updateDisplayService();

  if (runMode == RunMode::ShowingScore) {
    if (isTapPollDue(nowMs)) {
      lastTapPollMs = nowMs;
      Imu::readTapEvent();
    } else {
      enterIdleSleep();
    }
    if (static_cast<int32_t>(nowMs - scoreUntilMs) >= 0) {
      runMode = RunMode::Monitor;
    }
    return;
  }

  if (runMode == RunMode::Cooldown) {
    if (isTapPollDue(nowMs)) {
      lastTapPollMs = nowMs;
      Imu::readTapEvent();
    } else {
      enterIdleSleep();
    }
    if (static_cast<int32_t>(nowMs - cooldownUntilMs) >= 0) {
      runMode = RunMode::Monitor;
    }
    return;
  }

  if (runMode == RunMode::Monitor) {
    if (static_cast<int32_t>(nowMs - tapMutedUntilMs) < 0) {
      if (isTapPollDue(nowMs)) {
        lastTapPollMs = nowMs;
        Imu::readTapEvent();
      }
    } else if (isTapPollDue(nowMs)) {
      lastTapPollMs = nowMs;
      const TapEvent tapEvent = Imu::readTapEvent();
      handleMonitorTapEvent(tapEvent, nowMs);
      if (tapEvent != TapEvent::None) {
        return;
      }
      if (runMode != RunMode::Monitor) {
        return;
      }
    }
  }

  const bool imuInterrupted = Imu::consumeInterruptCount() != 0;
  if (imuInterrupted) {
    lastImuInterruptMs = nowMs;
  }
  const bool forceImuRead =
      !imuInterrupted && runMode != RunMode::Calibrate && isInterruptStalled(nowMs);
  if (!imuInterrupted && runMode != RunMode::Calibrate && !forceImuRead) {
    if (runMode == RunMode::Monitor) {
      if (isIdleTimedOut(nowMs)) {
        enterFinalSleep();
      }
      enterIdleSleep();
    }
    return;
  }
  if (forceImuRead) {
    lastImuInterruptMs = nowMs;
  }

  uint16_t accelMagnitudeMg = 0;
  int16_t gyroXRaw = 0;
  int16_t gyroYRaw = 0;
  int16_t gyroZRaw = 0;
  Imu::readMotionSample(accelMagnitudeMg, gyroXRaw, gyroYRaw, gyroZRaw);

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
    Imu::drainFifo();
    updateDisplayService();
    return;
  }

  const int16_t dynamicGyroXRaw = static_cast<int16_t>(gyroXRaw - gyroBaselineX);
  const int16_t dynamicGyroYRaw = static_cast<int16_t>(gyroYRaw - gyroBaselineY);
  const int16_t dynamicGyroZRaw = static_cast<int16_t>(gyroZRaw - gyroBaselineZ);
  const uint16_t gyroMagnitudeRaw =
      magnitudeRaw(dynamicGyroXRaw, dynamicGyroYRaw, dynamicGyroZRaw);
  latestGyroMagnitudeRaw = gyroMagnitudeRaw;

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

  if (runMode == RunMode::Monitor) {
    updateMotionCandidate(strength, nowMs);

    if (isCaptureStartMotion(strength, gyroMagnitudeRaw, dynamicAccelMg)) {
      Imu::readTapEvent();
      lastActivityMs = nowMs;
      startCapture(nowMs, liftStrength, captureStartTimeFor(nowMs));
      updateCapturePeaks(
          gyroMagnitudeRaw,
          dynamicAccelMg,
          liftStrength,
          nowMs);
      Imu::drainFifo();
      updateDisplayService();
      return;
    }

    if (isIdleTimedOut(nowMs)) {
      enterFinalSleep();
    }
    Imu::drainFifo();
    updateDisplayService();
    return;
  }

  if (runMode != RunMode::Capturing) {
    Imu::drainFifo();
    updateDisplayService();
    return;
  }

  Imu::readTapEvent();

  const uint16_t strength16 = liftStrength;
  if (strength16 > capturePeakStrength) {
    if (static_cast<uint32_t>(strength16) >=
        static_cast<uint32_t>(capturePeakStrength) + kCaptureRestartStrength) {
      startCapture(nowMs, strength16, nowMs);
    } else {
      capturePeakStrength = strength16;
    }
  }
  updateCapturePeaks(
      gyroMagnitudeRaw,
      dynamicAccelMg,
      strength16,
      nowMs);

  if (isCaptureFinished(strength16, nowMs)) {
    finishCapture(nowMs);
  }
  Imu::drainFifo();
  updateDisplayService();
}
