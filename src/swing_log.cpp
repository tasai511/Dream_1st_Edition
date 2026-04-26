#include "swing_log.h"

#include <EEPROM.h>

namespace {

const uint16_t kMagic = 0x534D;
const uint8_t kCapacity = 8;

struct SwingLogHeader {
  uint16_t magic;
  uint8_t nextSlot;
  uint8_t count;
  uint16_t nextIndex;
};

const int kHeaderAddress = 0;
const int kRecordsAddress = kHeaderAddress + static_cast<int>(sizeof(SwingLogHeader));

SwingLogHeader header = {kMagic, 0, 0, 1};

int recordAddress(uint8_t slot) {
  return kRecordsAddress + static_cast<int>(slot) * static_cast<int>(sizeof(SwingLogRecord));
}

void loadHeader() {
  EEPROM.get(kHeaderAddress, header);
  if (header.magic != kMagic || header.count > kCapacity || header.nextSlot >= kCapacity) {
    header.magic = kMagic;
    header.nextSlot = 0;
    header.count = 0;
    header.nextIndex = 1;
    EEPROM.put(kHeaderAddress, header);
  }
}

void saveHeader() {
  EEPROM.put(kHeaderAddress, header);
}

}  // namespace

namespace SwingLog {

void begin() {
  loadHeader();
}

bool hasRecords() {
  loadHeader();
  return header.count != 0;
}

void clear() {
  header.magic = kMagic;
  header.nextSlot = 0;
  header.count = 0;
  header.nextIndex = 1;
  saveHeader();
}

uint16_t nextIndex() {
  loadHeader();
  return header.nextIndex;
}

void append(const SwingLogRecord& record) {
  loadHeader();
  EEPROM.put(recordAddress(header.nextSlot), record);

  header.nextSlot = static_cast<uint8_t>((header.nextSlot + 1) % kCapacity);
  if (header.count < kCapacity) {
    ++header.count;
  }
  header.nextIndex = record.index + 1;
  saveHeader();
}

void dumpToSerial() {
  loadHeader();
  if (header.count == 0) {
    return;
  }

  const uint8_t startSlot = header.count == kCapacity ? header.nextSlot : 0;
  for (uint8_t i = 0; i < header.count; ++i) {
    const uint8_t slot = static_cast<uint8_t>((startSlot + i) % kCapacity);
    SwingLogRecord record = {};
    EEPROM.get(recordAddress(slot), record);

    Serial.print('#');
    Serial.print(record.index);
    Serial.print(" axis=");
    Serial.print(static_cast<int>(record.axis));
    Serial.print(" sign=");
    Serial.print(static_cast<int>(record.sign));
    Serial.print(" end=");
    Serial.print(record.endReason);
    Serial.print(" dur=");
    Serial.print(record.durationMs);
    Serial.print(" n=");
    Serial.print(record.sampleCount);
    Serial.print(" g=");
    Serial.print(record.maxGyroMagnitudeRaw);
    Serial.print(" axisMax=");
    Serial.print(record.maxAxisGyroRaw);
    Serial.print(" acc=");
    Serial.print(record.maxDynamicAccelMg);
    Serial.print(" base=");
    Serial.print(record.baselineGyroX);
    Serial.print(',');
    Serial.print(record.baselineGyroY);
    Serial.print(',');
    Serial.print(record.baselineGyroZ);
    Serial.print(" gpk=");
    Serial.print(record.gyroPeakMs);
    Serial.print(" apk=");
    Serial.print(record.accelPeakMs);
    Serial.print(" fg=");
    Serial.print(record.firstAxisOver500Ms);
    Serial.print(" fa=");
    Serial.print(record.firstAccel300Ms);
    Serial.print(" same=");
    Serial.print(record.sameSignSamples);
    Serial.print(" opp=");
    Serial.print(record.oppositeSignSamples);
    Serial.print(" weak=");
    Serial.print(record.weakAfterPeakSamples);
    Serial.print(" sG=");
    Serial.print(record.signedAxisEnergyDiv16);
    Serial.print(" eG=");
    Serial.print(record.axisEnergyDiv16);
    Serial.print(" dir=");
    Serial.print(record.directionRatioPct);
    Serial.print(" sc=");
    Serial.print(record.signChanges);
    Serial.print(" eA=");
    Serial.print(record.accelEnergyDiv16);
    Serial.print(" ac=");
    Serial.println(record.accelOver300Samples);
  }
}

}  // namespace SwingLog
