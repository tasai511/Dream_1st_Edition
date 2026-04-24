#include "swing.h"

namespace {

const uint16_t kBaselineShift = 5;
const uint16_t kBaselineTrackDeltaMg = 120;

const uint16_t kStartGyroRaw = 32000;
const uint16_t kStartDynamicAccelMg = 2200;
const uint8_t kRequiredStrongSamples = 5;

const uint32_t kActiveWindowMs = 220;
const uint32_t kCooldownMs = 1400;

uint16_t absDiff(uint16_t a, uint16_t b) {
  return a > b ? a - b : b - a;
}

}  // namespace

void SwingDetector::begin(uint32_t nowMs) {
  accelBaselineMg_ = 1000;
  strongSampleCount_ = 0;
  activeUntilMs_ = nowMs;
  cooldownUntilMs_ = nowMs;
}

bool SwingDetector::update(uint16_t gyroMagnitudeRaw,
                           uint16_t accelMagnitudeMg,
                           uint32_t nowMs) {
  const uint16_t dynamicAccelMg = absDiff(accelMagnitudeMg, accelBaselineMg_);

  if (dynamicAccelMg < kBaselineTrackDeltaMg) {
    const int32_t baselineDeltaMg =
        static_cast<int32_t>(accelMagnitudeMg) - static_cast<int32_t>(accelBaselineMg_);
    accelBaselineMg_ = static_cast<uint16_t>(
        static_cast<int32_t>(accelBaselineMg_) + (baselineDeltaMg >> kBaselineShift));
  }

  if (static_cast<int32_t>(cooldownUntilMs_ - nowMs) > 0) {
    strongSampleCount_ = 0;
    return false;
  }

  if (static_cast<int32_t>(activeUntilMs_ - nowMs) > 0) {
    strongSampleCount_ = 0;
    return false;
  }

  const bool accelReady = dynamicAccelMg >= kStartDynamicAccelMg;
  const bool gyroReady = gyroMagnitudeRaw >= kStartGyroRaw;
  if (!(gyroReady && accelReady)) {
    strongSampleCount_ = 0;
    return false;
  }

  if (strongSampleCount_ < 255) {
    ++strongSampleCount_;
  }
  if (strongSampleCount_ < kRequiredStrongSamples) {
    return false;
  }

  strongSampleCount_ = 0;
  activeUntilMs_ = nowMs + kActiveWindowMs;
  cooldownUntilMs_ = nowMs + kCooldownMs;
  return true;
}
