#pragma once

#include <Arduino.h>

namespace Display {

void begin();
void showNumber(uint16_t value, uint32_t nowMs, uint16_t durationMs = 2000);
void update(uint32_t nowMs);
void off();
bool isOn(uint32_t nowMs);

}  // namespace Display
