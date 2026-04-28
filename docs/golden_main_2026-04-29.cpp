#include <Arduino.h>
#include <megaTinyCore.h>

#include "buzzer.h"
#include "display.h"
#include "imu.h"
#include "tap.h"

namespace {

enum class RunMode : uint8_t {
  Calibrate,
  WaitingForLift,
  Measuring,
  ShowingScore,
};

const uint16_t kGyroCalibrationWindowMs = 1000;
const uint16_t kStartWindowMs = 1000;
const uint16_t kPostStartMeasureMs = 1400;
const uint16_t kScoreDisplayMs = 1500;
const uint16_t kTapDisplayMs = 1200;
const uint16_t kBaselineTrackDeltaMg = 120;
const uint16_t kBatteryFullMv = 3000;
const uint16_t kBatteryEmptyMv = 2600;

const uint16_t kLiftStartStrength = 520;
const uint16_t kLiftStartDelayMs = 400;
const uint16_t kSwingStartStrength = 1400;
const uint16_t kTapStartStrength = 450;
const uint16_t kTapConfirmStrength = 900;
const uint16_t kTapConfirmAccelMg = 120;
const uint16_t kTapConfirmRise = 320;
const uint16_t kTapReleaseStrength = 450;
const uint16_t kAccelRunThresholdMg = 350;
const uint16_t kAccelRunScoreMaxMs = 450;
const uint8_t kLiftRequiredSamples = 3;
const uint16_t kLiftSpinSustainedGyroRaw = 520;
const uint16_t kLiftSpinSustainedAccelMg = 90;
const uint16_t kLiftSpinSustainedMs = 140;
const uint16_t kTapMaxDurationMs = 90;
const uint16_t kDoubleTapWindowMs = 650;

const uint16_t kGyroScoreOffsetRaw = 700;
const uint16_t kAccelScoreOffsetMg = 300;
const uint8_t kGyroScoreScale = 3;
const uint8_t kAccelScoreScale = 2;
const uint8_t kAccelRunScoreDivisor = 3;
const uint8_t kFinalScorePct = 85;
const uint16_t kDisplayCurveLightInput = 300;
const uint16_t kDisplayCurveLightOutput = 160;
const uint16_t kDisplayCurveStrongInput = 400;
const uint16_t kDisplayCurveStrongOutput = 600;
const uint16_t kDisplayCurveProInput = 700;
const uint16_t kDisplayCurveProOutput = 999;

RunMode runMode = RunMode::Calibrate;
uint32_t calibrationUntilMs = 0;
uint32_t startWindowUntilMs = 0;
uint32_t swingStartedMs = 0;
uint32_t scoreUntilMs = 0;
uint32_t liftStartAtMs = 0;
uint32_t tapCandidateStartedMs = 0;
uint32_t lastTapConfirmedMs = 0;
uint16_t tapCandidatePeakStrength = 0;
uint16_t tapCandidatePeakAccelMg = 0;
uint16_t tapCandidatePeakRise = 0;
uint16_t previousTapStrength = 0;

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
uint16_t bestScore = 0;
uint16_t swingCount = 0;
uint32_t lastMeasureSampleMs = 0;
uint32_t liftSpinLastSampleMs = 0;
uint8_t liftSampleCount = 0;
uint16_t liftSpinSustainedMs = 0;
bool liftStartPending = false;
bool swingStarted = false;
bool tapCandidate = false;
bool tapRejectedUntilRelease = false;
bool waitingSecondTap = false;

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
  if (score <= kDisplayCurveLightInput) {
    return static_cast<uint16_t>(
        (score * kDisplayCurveLightOutput) / kDisplayCurveLightInput);
  }
  if (score <= kDisplayCurveStrongInput) {
    const uint32_t inputSpan = kDisplayCurveStrongInput - kDisplayCurveLightInput;
    const uint32_t outputSpan = kDisplayCurveStrongOutput - kDisplayCurveLightOutput;
    return static_cast<uint16_t>(
        kDisplayCurveLightOutput +
        ((score - kDisplayCurveLightInput) * outputSpan) / inputSpan);
  }
  if (score <= kDisplayCurveProInput) {
    const uint32_t inputSpan = kDisplayCurveProInput - kDisplayCurveStrongInput;
    const uint32_t outputSpan = kDisplayCurveProOutput - kDisplayCurveStrongOutput;
    return static_cast<uint16_t>(
        kDisplayCurveStrongOutput +
        ((score - kDisplayCurveStrongInput) * outputSpan) / inputSpan);
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

void resetLiftStart() {
  liftSampleCount = 0;
  liftSpinSustainedMs = 0;
  liftSpinLastSampleMs = 0;
  liftStartPending = false;
}

void resetTapPeaks() {
  tapCandidatePeakStrength = 0;
  tapCandidatePeakAccelMg = 0;
  tapCandidatePeakRise = 0;
}

void finishCalibration() {
  if (calibrationSamples != 0) {
    gyroBaselineX = static_cast<int16_t>(gyroXSum / calibrationSamples);
    gyroBaselineY = static_cast<int16_t>(gyroYSum / calibrationSamples);
    gyroBaselineZ = static_cast<int16_t>(gyroZSum / calibrationSamples);
    accelBaselineMg = static_cast<uint16_t>(accelSumMg / calibrationSamples);
  }
  Display::off();
  resetLiftStart();
  runMode = RunMode::WaitingForLift;
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
  resetLiftStart();
  resetMeasurement();
  startWindowUntilMs = millis() + kStartWindowMs;
  runMode = RunMode::Measuring;
}

bool updateLiftSpinRejection(
    uint16_t gyroMagnitudeRaw, uint16_t dynamicAccelMg, uint32_t nowMs) {
  if (gyroMagnitudeRaw >= kLiftSpinSustainedGyroRaw &&
      dynamicAccelMg <= kLiftSpinSustainedAccelMg) {
    if (liftSpinLastSampleMs != 0) {
      const uint16_t deltaMs = static_cast<uint16_t>(nowMs - liftSpinLastSampleMs);
      const uint32_t nextMs = static_cast<uint32_t>(liftSpinSustainedMs) + deltaMs;
      liftSpinSustainedMs = nextMs > 65535 ? 65535 : static_cast<uint16_t>(nextMs);
    }
    liftSpinLastSampleMs = nowMs;
  } else {
    liftSpinSustainedMs = 0;
    liftSpinLastSampleMs = nowMs;
  }

  return liftSpinSustainedMs >= kLiftSpinSustainedMs;
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
  if (score > 999) {
    score = 999;
  }
  return displayScoreFromMotionScore(score);
}

void finishMeasurement(uint32_t nowMs, uint16_t score) {
  Display::showNumber(score, nowMs, kScoreDisplayMs);
  scoreUntilMs = nowMs + kScoreDisplayMs;
  runMode = RunMode::ShowingScore;
}

void finishNoSwing() {
  Display::off();
  resetLiftStart();
  runMode = RunMode::WaitingForLift;
}

void showUiValue(uint16_t value, uint32_t nowMs) {
  Display::showNumber(value, nowMs, kTapDisplayMs);
  scoreUntilMs = nowMs + kTapDisplayMs;
  resetLiftStart();
  runMode = RunMode::ShowingScore;
}

void handleTapEvent(TapEvent event, uint32_t nowMs) {
  if (event == TapEvent::Single) {
    showUiValue(bestScore, nowMs);
  } else if (event == TapEvent::Double) {
    showUiValue(swingCount, nowMs);
  }
}

TapEvent updateTapGesture(uint32_t strength, uint16_t dynamicAccelMg, uint32_t nowMs) {
  const uint16_t strength16 = saturateToUint16(strength);
  const uint16_t strengthRise =
      strength16 > previousTapStrength ? strength16 - previousTapStrength : 0;
  previousTapStrength = strength16;

  if (tapRejectedUntilRelease) {
    if (strength <= kTapReleaseStrength) {
      tapRejectedUntilRelease = false;
    }
    return TapEvent::None;
  }

  if (tapCandidate) {
    if (strength > tapCandidatePeakStrength) {
      tapCandidatePeakStrength = strength16;
    }
    if (dynamicAccelMg > tapCandidatePeakAccelMg) {
      tapCandidatePeakAccelMg = dynamicAccelMg;
    }
    if (strengthRise > tapCandidatePeakRise) {
      tapCandidatePeakRise = strengthRise;
    }

    if (strength <= kTapReleaseStrength) {
      tapCandidate = false;
      const bool strongAccelTap = tapCandidatePeakAccelMg >= kTapConfirmAccelMg;
      const bool sharpStrengthTap = tapCandidatePeakStrength >= kTapConfirmStrength &&
                                    tapCandidatePeakRise >= kTapConfirmRise;
      if (!strongAccelTap && !sharpStrengthTap) {
        return TapEvent::None;
      }
      if (waitingSecondTap &&
          static_cast<int32_t>(nowMs - (lastTapConfirmedMs + kDoubleTapWindowMs)) <= 0) {
        waitingSecondTap = false;
        lastTapConfirmedMs = nowMs;
        return TapEvent::Double;
      }
      waitingSecondTap = true;
      lastTapConfirmedMs = nowMs;
      return TapEvent::None;
    }

    if (static_cast<int32_t>(nowMs - (tapCandidateStartedMs + kTapMaxDurationMs)) >= 0) {
      tapCandidate = false;
      waitingSecondTap = false;
      tapRejectedUntilRelease = true;
    }
    return TapEvent::None;
  }

  if (waitingSecondTap) {
    if (static_cast<int32_t>(nowMs - (lastTapConfirmedMs + kDoubleTapWindowMs)) >= 0) {
      waitingSecondTap = false;
      return TapEvent::Single;
    }
  }

  if (strength >= kTapStartStrength) {
    tapCandidate = true;
    tapCandidateStartedMs = nowMs;
    tapCandidatePeakStrength = strength16;
    tapCandidatePeakAccelMg = dynamicAccelMg;
    tapCandidatePeakRise = strengthRise;
  }

  return TapEvent::None;
}

bool isTapGestureBusy() {
  return tapCandidate || waitingSecondTap;
}

void resetTapGesture() {
  tapCandidate = false;
  tapRejectedUntilRelease = false;
  waitingSecondTap = false;
  resetTapPeaks();
  previousTapStrength = 0;
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

  const bool tapInputActive = runMode == RunMode::WaitingForLift ||
                              runMode == RunMode::ShowingScore;
  if (tapInputActive) {
    const TapEvent tapEvent = updateTapGesture(strength, dynamicAccelMg, nowMs);
    if (tapEvent != TapEvent::None) {
      handleTapEvent(tapEvent, nowMs);
      return;
    }
    if (isTapGestureBusy()) {
      resetLiftStart();
      return;
    }
  } else {
    resetTapGesture();
  }

  if (runMode == RunMode::ShowingScore) {
    if (static_cast<int32_t>(nowMs - scoreUntilMs) >= 0) {
      resetLiftStart();
      runMode = RunMode::WaitingForLift;
    }
    return;
  }

  if (runMode == RunMode::WaitingForLift) {
    if (liftStartPending) {
      if (strength >= kLiftStartStrength &&
          updateLiftSpinRejection(gyroMagnitudeRaw, dynamicAccelMg, nowMs)) {
        return;
      }
      if (static_cast<int32_t>(nowMs - liftStartAtMs) >= 0) {
        startMeasurementCue();
      }
      return;
    }

    if (strength >= kLiftStartStrength &&
        updateLiftSpinRejection(gyroMagnitudeRaw, dynamicAccelMg, nowMs)) {
      resetLiftStart();
      return;
    }

    if (strength >= kLiftStartStrength) {
      if (liftSampleCount < 255) {
        ++liftSampleCount;
      }
      if (liftSampleCount >= kLiftRequiredSamples) {
        liftStartPending = true;
        liftStartAtMs = nowMs + kLiftStartDelayMs;
        liftSampleCount = 0;
      }
    } else {
      liftSampleCount = 0;
      liftSpinSustainedMs = 0;
      liftSpinLastSampleMs = 0;
    }
    return;
  }

  if (runMode != RunMode::Measuring) {
    return;
  }

  if (!swingStarted && strength >= kSwingStartStrength) {
    swingStarted = true;
    swingStartedMs = nowMs;
    lastMeasureSampleMs = nowMs;
  }

  if (!swingStarted && static_cast<int32_t>(nowMs - startWindowUntilMs) >= 0) {
    finishNoSwing();
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
    const uint16_t score = scoreFromPeaks();
    const bool newBest = score > bestScore;
    if (newBest) {
      bestScore = score;
    }
    if (swingCount < 999) {
      ++swingCount;
    }
    Buzzer::beep(newBest ? 3 : 1, micros());
    finishMeasurement(nowMs, score);
  }
}
