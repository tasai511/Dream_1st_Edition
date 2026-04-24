#pragma once

#include <Arduino.h>

enum class TapEvent : uint8_t {
  None,
  Single,
  Double,
};

class TapDetector {
 public:
  void begin(uint32_t nowMs);

  // accelMagnitudeMg is the absolute acceleration magnitude in milli-g.
  // swingActive should be true while the score/swing state machine is busy.
  TapEvent update(uint16_t accelMagnitudeMg, bool swingActive, uint32_t nowMs);
  TapEvent updatePending(uint32_t nowMs);

 private:
  uint16_t baselineMg_ = 1000;
  uint32_t lastTapMs_ = 0;
  uint32_t lastSwingMs_ = 0;
  uint32_t stableSinceMs_ = 0;
  bool armed_ = true;
  bool waitingSecondTap_ = false;
};
