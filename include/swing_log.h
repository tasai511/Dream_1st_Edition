#pragma once

#include <Arduino.h>

struct SwingLogRecord {
  uint16_t index;
  int8_t axis;
  int8_t sign;
  uint8_t endReason;
  uint16_t durationMs;
  uint16_t sampleCount;
  uint16_t maxGyroMagnitudeRaw;
  uint16_t maxAxisGyroRaw;
  uint16_t maxDynamicAccelMg;
  int16_t baselineGyroX;
  int16_t baselineGyroY;
  int16_t baselineGyroZ;
  uint16_t gyroPeakMs;
  uint16_t accelPeakMs;
  uint16_t firstAxisOver500Ms;
  uint16_t firstAccel300Ms;
  uint16_t sameSignSamples;
  uint16_t oppositeSignSamples;
  uint16_t weakAfterPeakSamples;
  int16_t signedAxisEnergyDiv16;
  uint16_t axisEnergyDiv16;
  uint8_t directionRatioPct;
  uint8_t signChanges;
  uint16_t accelEnergyDiv16;
  uint16_t accelOver300Samples;
};

namespace SwingLog {

void begin();
bool hasRecords();
void clear();
uint16_t nextIndex();
void append(const SwingLogRecord& record);
void dumpToSerial();

}  // namespace SwingLog
