#include "display.h"

namespace {

const uint8_t kSegmentPins[] = {
    PIN_PB0,  // A
    PIN_PB2,  // B
    PIN_PB4,  // C
    PIN_PB3,  // D
    PIN_PB1,  // E
    PIN_PB5,  // F
    PIN_PC0,  // G
};

const uint8_t kDigitPins[] = {
    PIN_PC1,
    PIN_PC2,
    PIN_PC3,
};

const uint8_t kDigitCount = 3;
const uint16_t kMaxDisplayValue = 999;
const uint16_t kMultiplexIntervalMs = 2;

// Bit order is A B C D E F G. Common cathode: segment HIGH lights segment.
const uint8_t kSegmentsForDigit[] = {
    0b1111110,  // 0
    0b0110000,  // 1
    0b1101101,  // 2
    0b1111001,  // 3
    0b0110011,  // 4
    0b1011011,  // 5
    0b1011111,  // 6
    0b1110000,  // 7
    0b1111111,  // 8
    0b1111011,  // 9
};

uint8_t digits[kDigitCount] = {0, 0, 0};
bool blankDigit[kDigitCount] = {true, true, true};
uint8_t activeDigit = 0;
uint32_t visibleUntilMs = 0;
uint32_t lastMultiplexMs = 0;

void disableDigits() {
  for (uint8_t i = 0; i < kDigitCount; ++i) {
    digitalWrite(kDigitPins[i], LOW);
  }
}

void clearSegments() {
  for (uint8_t i = 0; i < sizeof(kSegmentPins); ++i) {
    digitalWrite(kSegmentPins[i], LOW);
  }
}

void setSegments(uint8_t value) {
  if (value > 9) {
    clearSegments();
    return;
  }

  const uint8_t mask = kSegmentsForDigit[value];
  for (uint8_t i = 0; i < sizeof(kSegmentPins); ++i) {
    const uint8_t bit = 6 - i;
    digitalWrite(kSegmentPins[i], (mask & (1 << bit)) ? HIGH : LOW);
  }
}

void prepareDigits(uint16_t value) {
  if (value > kMaxDisplayValue) {
    value = kMaxDisplayValue;
  }

  digits[0] = value / 100;
  digits[1] = (value / 10) % 10;
  digits[2] = value % 10;

  blankDigit[0] = value < 100;
  blankDigit[1] = value < 10;
  blankDigit[2] = false;
}

}  // namespace

namespace Display {

void begin() {
  for (uint8_t i = 0; i < sizeof(kSegmentPins); ++i) {
    pinMode(kSegmentPins[i], OUTPUT);
  }
  for (uint8_t i = 0; i < kDigitCount; ++i) {
    pinMode(kDigitPins[i], OUTPUT);
  }

  off();
}

void showNumber(uint16_t value, uint32_t nowMs, uint16_t durationMs) {
  prepareDigits(value);
  visibleUntilMs = nowMs + durationMs;
  lastMultiplexMs = 0;
}

void update(uint32_t nowMs) {
  if (!isOn(nowMs)) {
    off();
    return;
  }

  if (lastMultiplexMs != 0 && nowMs - lastMultiplexMs < kMultiplexIntervalMs) {
    return;
  }
  lastMultiplexMs = nowMs;

  disableDigits();
  clearSegments();

  activeDigit = (activeDigit + 1) % kDigitCount;
  if (!blankDigit[activeDigit]) {
    setSegments(digits[activeDigit]);
    digitalWrite(kDigitPins[activeDigit], HIGH);
  }
}

void off() {
  visibleUntilMs = 0;
  disableDigits();
  clearSegments();
}

bool isOn(uint32_t nowMs) {
  return visibleUntilMs != 0 && static_cast<int32_t>(visibleUntilMs - nowMs) > 0;
}

}  // namespace Display
