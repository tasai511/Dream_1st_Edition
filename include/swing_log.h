#pragma once

#include <Arduino.h>

struct SwingLogRecord {
  uint16_t index;
  uint16_t maxGyroX;
  uint16_t maxGyroY;
  uint16_t maxGyroZ;
  uint16_t maxDynamicAccelMg;
};

namespace SwingLog {

void begin();
bool hasRecords();
void clear();
uint16_t nextIndex();
void append(const SwingLogRecord& record);
void dumpToSerial();

}  // namespace SwingLog
