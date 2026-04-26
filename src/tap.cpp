#include "tap.h"

namespace {

const uint16_t kBaselineShift = 4;
const uint16_t kTapDeltaMg = 950;
const uint16_t kSecondTapDeltaMg = 450;
const uint16_t kStableDeltaMg = 120;
const uint16_t kRearmDeltaMg = 180;
const uint32_t kTapCooldownMs = 90;
const uint32_t kDoubleTapWindowMs = 650;
const uint32_t kAfterSwingIgnoreMs = 700;
const uint32_t kRequiredStableMs = 180;

uint16_t absDiff(uint16_t a, uint16_t b) {
  return a > b ? a - b : b - a;
}

}  // namespace

void TapDetector::begin(uint32_t nowMs) {
  baselineMg_ = 1000;
  lastTapMs_ = nowMs - kTapCooldownMs;
  lastSwingMs_ = nowMs - kAfterSwingIgnoreMs;
  stableSinceMs_ = nowMs;
  armed_ = true;
  waitingSecondTap_ = false;
}

TapEvent TapDetector::update(uint16_t accelMagnitudeMg, bool swingActive, uint32_t nowMs) {
  if (swingActive) {
    lastSwingMs_ = nowMs;
    armed_ = false;
    waitingSecondTap_ = false;
    return TapEvent::None;
  }

  const uint16_t deltaMg = absDiff(accelMagnitudeMg, baselineMg_);
  const bool waitingForSecondTap =
      waitingSecondTap_ && nowMs - lastTapMs_ <= kDoubleTapWindowMs;
  const bool wasStable = stableSinceMs_ != 0 && nowMs - stableSinceMs_ >= kRequiredStableMs;

  if (deltaMg < kStableDeltaMg) {
    if (stableSinceMs_ == 0) {
      stableSinceMs_ = nowMs;
    }
  } else {
    stableSinceMs_ = 0;
  }

  if (deltaMg < kRearmDeltaMg && (wasStable || waitingForSecondTap)) {
    armed_ = true;
  }

  // Track slow orientation changes, but do not chase the sharp tap impulse.
  if (deltaMg < kTapDeltaMg) {
    const int32_t baselineDeltaMg =
        static_cast<int32_t>(accelMagnitudeMg) - static_cast<int32_t>(baselineMg_);
    baselineMg_ = static_cast<uint16_t>(
        static_cast<int32_t>(baselineMg_) + (baselineDeltaMg >> kBaselineShift));
  }

  if (!armed_) {
    return TapEvent::None;
  }
  if (nowMs - lastTapMs_ < kTapCooldownMs) {
    return TapEvent::None;
  }
  if (nowMs - lastSwingMs_ < kAfterSwingIgnoreMs) {
    return TapEvent::None;
  }

  if (waitingSecondTap_) {
    if (nowMs - lastTapMs_ > kDoubleTapWindowMs) {
      return TapEvent::None;
    }
    if (deltaMg < kSecondTapDeltaMg) {
      return TapEvent::None;
    }

    waitingSecondTap_ = false;
    armed_ = false;
    lastTapMs_ = nowMs;
    return TapEvent::Double;
  }

  if (!wasStable) {
    return TapEvent::None;
  }
  if (deltaMg < kTapDeltaMg) {
    return TapEvent::None;
  }

  armed_ = false;
  lastTapMs_ = nowMs;
  waitingSecondTap_ = true;
  return TapEvent::None;
}

TapEvent TapDetector::updatePending(uint32_t nowMs) {
  if (!waitingSecondTap_) {
    return TapEvent::None;
  }
  if (nowMs - lastTapMs_ <= kDoubleTapWindowMs) {
    return TapEvent::None;
  }

  waitingSecondTap_ = false;
  armed_ = false;
  return TapEvent::Single;
}
