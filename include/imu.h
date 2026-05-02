#pragma once

#include <Arduino.h>

#include "tap.h"

namespace Imu {

void begin();
bool isReady();
uint8_t consumeInterruptCount();
void drainFifo();
TapEvent readTapEvent();
void enterSleepMode();
void readMotionSample(uint16_t& accelMagnitudeMg, int16_t& gyroXRaw, int16_t& gyroYRaw, int16_t& gyroZRaw);
void readAccelAxesMg(int16_t& x, int16_t& y, int16_t& z);
uint16_t readAccelMagnitudeMg();
void readGyroAxesRaw(int16_t& x, int16_t& y, int16_t& z);
uint16_t readGyroMagnitudeRaw();

}  // namespace Imu
