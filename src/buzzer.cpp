#include "buzzer.h"

namespace {

const uint8_t kBuzzerP = PIN_PA6;
const uint8_t kBuzzerN = PIN_PA7;
const uint16_t kHalfPeriodUs = 125;
const uint32_t kBeepDurationUs = 50000;
const uint32_t kLongBeepDurationUs = 250000;
const uint32_t kBeepGapUs = 90000;

uint8_t remainingBeeps = 0;
bool toneActive = false;
bool continuousTone = false;
bool outputPhase = false;
bool buzzerOn = false;
uint32_t nextToggleUs = 0;
uint32_t phaseUntilUs = 0;

void driveOff() {
  digitalWrite(kBuzzerP, LOW);
  digitalWrite(kBuzzerN, LOW);
  buzzerOn = false;
}

void startTone(uint32_t nowMicros) {
  toneActive = true;
  outputPhase = false;
  nextToggleUs = nowMicros;
  phaseUntilUs = nowMicros + kBeepDurationUs;
}

void startGap(uint32_t nowMicros) {
  toneActive = false;
  driveOff();
  phaseUntilUs = nowMicros + kBeepGapUs;
}

void driveToneBlocking(uint32_t durationUs) {
  const uint32_t startedUs = micros();
  uint32_t nextToggleUs = startedUs;
  bool phase = false;

  while (static_cast<int32_t>(micros() - startedUs) < static_cast<int32_t>(durationUs)) {
    const uint32_t nowUs = micros();
    if (static_cast<int32_t>(nowUs - nextToggleUs) >= 0) {
      phase = !phase;
      digitalWrite(kBuzzerP, phase ? HIGH : LOW);
      digitalWrite(kBuzzerN, phase ? LOW : HIGH);
      nextToggleUs += kHalfPeriodUs;
    }
  }
  driveOff();
}

}  // namespace

namespace Buzzer {

void begin() {
  pinMode(kBuzzerP, OUTPUT);
  pinMode(kBuzzerN, OUTPUT);
  off();
}

void beep(uint8_t count, uint32_t nowMicros) {
  (void)nowMicros;
  if (continuousTone) {
    return;
  }

  remainingBeeps = 0;
  toneActive = false;
  for (uint8_t i = 0; i < count; ++i) {
    driveToneBlocking(kBeepDurationUs);
    if (i + 1 < count) {
      delay(kBeepGapUs / 1000);
    }
  }
}

void milestoneBeep(uint32_t nowMicros) {
  (void)nowMicros;
  if (continuousTone) {
    return;
  }

  remainingBeeps = 0;
  toneActive = false;
  driveToneBlocking(kBeepDurationUs);
  delay(kBeepGapUs / 1000);
  driveToneBlocking(kBeepDurationUs);
  delay(kBeepGapUs / 1000);
  driveToneBlocking(kLongBeepDurationUs);
}

void toneOn(uint32_t nowMicros) {
  continuousTone = true;
  toneActive = true;
  outputPhase = false;
  nextToggleUs = nowMicros;
}

void update(uint32_t nowMicros) {
  if (continuousTone) {
    if (static_cast<int32_t>(nowMicros - nextToggleUs) >= 0) {
      outputPhase = !outputPhase;
      digitalWrite(kBuzzerP, outputPhase ? HIGH : LOW);
      digitalWrite(kBuzzerN, outputPhase ? LOW : HIGH);
      buzzerOn = true;
      nextToggleUs += kHalfPeriodUs;
    }
    return;
  }

  if (remainingBeeps == 0) {
    off();
    return;
  }

  if (toneActive) {
    if (static_cast<int32_t>(nowMicros - phaseUntilUs) >= 0) {
      --remainingBeeps;
      if (remainingBeeps == 0) {
        off();
      } else {
        startGap(nowMicros);
      }
      return;
    }

    if (static_cast<int32_t>(nowMicros - nextToggleUs) >= 0) {
      outputPhase = !outputPhase;
      digitalWrite(kBuzzerP, outputPhase ? HIGH : LOW);
      digitalWrite(kBuzzerN, outputPhase ? LOW : HIGH);
      buzzerOn = true;
      nextToggleUs += kHalfPeriodUs;
    }
    return;
  }

  if (static_cast<int32_t>(nowMicros - phaseUntilUs) >= 0) {
    startTone(nowMicros);
  }
}

void off() {
  continuousTone = false;
  remainingBeeps = 0;
  toneActive = false;
  driveOff();
}

bool isActive() {
  return remainingBeeps != 0 || continuousTone;
}

}  // namespace Buzzer
