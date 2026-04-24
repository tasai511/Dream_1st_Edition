#include "swing_log.h"

#include <EEPROM.h>

namespace {

const uint16_t kMagic = 0x5347;
const uint8_t kCapacity = 16;

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
  Serial.println("# swing log");
  if (header.count == 0) {
    Serial.println("# empty");
    return;
  }

  const uint8_t startSlot = header.count == kCapacity ? header.nextSlot : 0;
  for (uint8_t i = 0; i < header.count; ++i) {
    const uint8_t slot = static_cast<uint8_t>((startSlot + i) % kCapacity);
    SwingLogRecord record = {};
    EEPROM.get(recordAddress(slot), record);

    Serial.print('#');
    Serial.print(record.index);
    Serial.print(" gx=");
    Serial.print(record.maxGyroX);
    Serial.print(" gy=");
    Serial.print(record.maxGyroY);
    Serial.print(" gz=");
    Serial.print(record.maxGyroZ);
    Serial.print(" acc=");
    Serial.println(record.maxDynamicAccelMg);
  }
}

}  // namespace SwingLog
