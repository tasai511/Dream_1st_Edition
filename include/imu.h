#pragma once

#include <Arduino.h>

#include "tap.h"

namespace Imu {

void begin();
bool isReady();
TapEvent readTapEvent();
void enterSleepMode();
void readAccelAxesMg(int16_t& x, int16_t& y, int16_t& z);
uint16_t readAccelMagnitudeMg();
void readGyroAxesRaw(int16_t& x, int16_t& y, int16_t& z);
uint16_t readGyroMagnitudeRaw();

}  // namespace Imu
