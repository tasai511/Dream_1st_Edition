#pragma once

#include <Arduino.h>

namespace Buzzer {

void begin();
void beep(uint8_t count, uint32_t nowMicros);
void milestoneBeep(uint32_t nowMicros);
void toneOn(uint32_t nowMicros);
void update(uint32_t nowMicros);
void off();
bool isActive();

}  // namespace Buzzer
