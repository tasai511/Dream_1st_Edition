#pragma once

#include <Arduino.h>

class SwingDetector {
 public:
  void begin(uint32_t nowMs);
  bool update(uint16_t gyroMagnitudeRaw, uint16_t accelMagnitudeMg, uint32_t nowMs);

 private:
  uint16_t accelBaselineMg_ = 1000;
  uint8_t strongSampleCount_ = 0;
  uint32_t activeUntilMs_ = 0;
  uint32_t cooldownUntilMs_ = 0;
};
