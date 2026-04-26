#pragma once

#include <Arduino.h>

namespace Imu {

void begin();
bool isReady();
void readAccelAxesMg(int16_t& x, int16_t& y, int16_t& z);
uint16_t readAccelMagnitudeMg();
void readGyroAxesRaw(int16_t& x, int16_t& y, int16_t& z);
uint16_t readGyroMagnitudeRaw();

}  // namespace Imu
