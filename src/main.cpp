#include <Arduino.h>

#include "buzzer.h"
#include "display.h"
#include "imu.h"
#include "swing_log.h"

namespace {

enum class RunMode : uint8_t {
  Measure,
  DumpThenClear,
  Idle,
};

const uint16_t kBaselineTrackDeltaMg = 120;
const uint16_t kCaptureWindowMs = 2000;
RunMode runMode = RunMode::Idle;
uint32_t captureUntilMs = 0;
uint16_t swingBaselineMg = 1000;
SwingLogRecord captureLog = {};

uint16_t abs16(int16_t value) {
  return value < 0 ? static_cast<uint16_t>(-value) : static_cast<uint16_t>(value);
}

uint16_t absDiff16(uint16_t a, uint16_t b) {
  return a > b ? a - b : b - a;
}

}  // namespace

void setup() {
  Serial.begin(115200);
  Buzzer::begin();
  Display::begin();
  Imu::begin();
  SwingLog::begin();

  if (SwingLog::hasRecords()) {
    Display::off();
    delay(300);
    SwingLog::dumpToSerial();
    SwingLog::clear();
    Serial.println("# cleared");
    runMode = RunMode::DumpThenClear;
    return;
  }

  captureUntilMs = millis() + kCaptureWindowMs;
  captureLog = {};
  captureLog.index = SwingLog::nextIndex();
  Display::showNumber(888, millis(), kCaptureWindowMs);
  runMode = RunMode::Measure;
}

void loop() {
  const uint32_t nowMs = millis();
  const uint32_t nowUs = micros();

  Buzzer::update(nowUs);

  if (!Buzzer::isActive()) {
    Display::update(nowMs);
  }

  if (runMode == RunMode::DumpThenClear || runMode == RunMode::Idle) {
    return;
  }

  const uint16_t accelMagnitudeMg = Imu::readAccelMagnitudeMg();

  int16_t gyroXRaw = 0;
  int16_t gyroYRaw = 0;
  int16_t gyroZRaw = 0;
  Imu::readGyroAxesRaw(gyroXRaw, gyroYRaw, gyroZRaw);
  const uint16_t gyroMagnitudeRaw = Imu::readGyroMagnitudeRaw();

  const uint16_t dynamicAccelMg = absDiff16(accelMagnitudeMg, swingBaselineMg);
  if (dynamicAccelMg < kBaselineTrackDeltaMg) {
    const int32_t baselineDeltaMg =
        static_cast<int32_t>(accelMagnitudeMg) - static_cast<int32_t>(swingBaselineMg);
    swingBaselineMg = static_cast<uint16_t>(
        static_cast<int32_t>(swingBaselineMg) + (baselineDeltaMg >> 5));
  }

  if (runMode == RunMode::Measure) {
    const uint16_t absGyroX = abs16(gyroXRaw);
    const uint16_t absGyroY = abs16(gyroYRaw);
    const uint16_t absGyroZ = abs16(gyroZRaw);
    if (absGyroX > captureLog.maxGyroX) {
      captureLog.maxGyroX = absGyroX;
    }
    if (absGyroY > captureLog.maxGyroY) {
      captureLog.maxGyroY = absGyroY;
    }
    if (absGyroZ > captureLog.maxGyroZ) {
      captureLog.maxGyroZ = absGyroZ;
    }
    if (dynamicAccelMg > captureLog.maxDynamicAccelMg) {
      captureLog.maxDynamicAccelMg = dynamicAccelMg;
    }
  }

  if (runMode == RunMode::Measure &&
      static_cast<int32_t>(nowMs - captureUntilMs) >= 0) {
    SwingLog::append(captureLog);
    Display::off();
    Buzzer::beep(1, nowUs);
    runMode = RunMode::Idle;
  }
}
