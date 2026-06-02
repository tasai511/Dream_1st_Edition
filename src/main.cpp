#include <Arduino.h>
#include <EEPROM.h>
#include <stddef.h>
#include <avr/sleep.h>
#include <megaTinyCore.h>

#include "buzzer.h"
#include "display.h"
#include "imu.h"
#include "tap.h"

namespace {

enum class RunMode : uint8_t {
  Calibrate,
  Monitor,
  Capturing,
  ShowingScore,
  Cooldown,
};

enum class TapStatsStage : uint8_t {
  None,
  Average,
  Best,
};

const uint16_t kGyroCalibrationWindowMs = 1000;
const uint16_t kCaptureMaxMs = 900;
const uint16_t kCaptureMinMs = 80;
const uint16_t kMinAcceptedSwingDurationMs = 160;
const uint16_t kShortSwingDurationMs = 80;
const uint16_t kCaptureEndQuietMs = 40;
const uint16_t kCaptureEndDropPct = 70;
const uint16_t kCaptureDiscardCooldownMs = 120;
const uint16_t kTapMuteAfterScoreMs = 250;
const uint16_t kTapMuteAfterStartupMs = 1000;
const uint16_t kTapAcceptMuteMs = 80;
const uint8_t kTapPollMs = 50;
const uint8_t kIntStallClearMs = 10;
const uint16_t kSingleTapConfirmMs = 300;
const uint16_t kDoubleTapMinGapMs = 30;
const uint16_t kCaptureStartStrength = 2400;
const uint16_t kCaptureStartGyroRaw = 900;
const uint16_t kCaptureRestartStrength = 1800;
const uint16_t kPreCaptureQuietMs = 70;
const uint8_t kMinSwingEvidence = 6;
const uint16_t kMinDisplayScore = 100;
const uint16_t kScoreDisplayMs = 2000;
const uint16_t kTapStatsDisplayMs = 1000;
const uint16_t kTapDisplayMs = 1400;
const uint8_t kMilestoneSwingInterval = 50;
const uint16_t kBaselineTrackDeltaMg = 120;
const uint16_t kBatteryFullMv = 3000;
const uint16_t kBatteryEmptyMv = 2600;
const uint32_t kAutoSleepIdleMs = 300000UL;

const uint16_t kCaptureStartAccelMg = 1800;
const uint16_t kActivityStrengthThreshold = 650;

const uint16_t kNoTimeMs = 65535;
const uint16_t kAccelRiseStartMg = 700;
const uint16_t kAccelTrendNoiseMg = 140;
const uint8_t kAccelTrendFallSamples = 2;
const uint16_t kGyroRiseThresholdRaw = 900;
const uint16_t kGyroRiseTooFastMs = 15;
const uint16_t kGyroRiseGoodMs = 35;
const uint16_t kGyroMdpsPerLsb = 140;
const uint16_t kGyroPeakFullDps = 7000;
const uint16_t kGyroPeakScoreMax = 500;
const uint16_t kSwingAccelAreaScoreOffsetMg = 1000;
const uint32_t kSwingAccelAreaFullMgMs = 600000UL;
const uint16_t kSwingAccelAreaScoreMax = 500;
const uint16_t kInternalScoreMax = 999;
const uint32_t kBestTelemetryMagic = 0x42535747UL;  // "BSWG"
const uint8_t kBestTelemetryVersion = 16;
const uint8_t kCaptureLogSampleCapacity = 96;
const uint8_t kPreCaptureLogSampleCapacity = 24;
const uint16_t kPreCaptureTelemetryMs = 300;
const uint8_t kTelemetryEepromBytesPerService = 1;
const uint8_t kScoreAccelDropPct = 80;
const uint16_t kScoreAccelDropMinMg = 1000;
const uint8_t kScoreGyroDropPct = 85;
const uint16_t kScoreGyroDropMinRaw = kGyroRiseThresholdRaw;

struct BestSwingSample {
  int16_t elapsedMs;
  uint16_t gyroRaw;
  uint16_t accelMg;
} __attribute__((packed));

struct PreCaptureSample {
  uint32_t sampledMs;
  uint16_t gyroRaw;
  uint16_t accelMg;
};

struct ScoreWindow {
  bool hasSamples;
  bool accelDropSeen;
  bool gyroDropSeen;
  int16_t startMs;
  int16_t gyroPeakMs;
  int16_t accelPeakMs;
  int16_t endMs;
  int16_t gyroEndMs;
  int16_t lastSampleMs;
  int16_t lastGyroSampleMs;
  uint16_t gyroPeakRaw;
  uint16_t accelPeakMg;
};

struct BestSwingTelemetryHeader {
  uint32_t magic;
  uint8_t version;
  uint8_t checksum;
  uint8_t sampleCount;
  uint16_t sampleTotal;
  uint16_t score;
  uint16_t swingNumber;
  uint16_t averageBefore;
  uint16_t swingDurationMs;
  uint16_t endDecisionMs;
  int16_t scoreStartMs;
  int16_t scoreEndMs;
  uint8_t preSampleCount;
  uint8_t preRingCount;
  uint8_t recentSampleCount;
  uint16_t recentMaxAgeMs;
  uint32_t accelAreaMgMs;
  uint16_t gyroScore;
  uint16_t accelScore;
} __attribute__((packed));

RunMode runMode = RunMode::Calibrate;
uint32_t calibrationUntilMs = 0;
uint32_t swingStartedMs = 0;
uint32_t scoreUntilMs = 0;
uint32_t tapStatsUntilMs = 0;
uint32_t cooldownUntilMs = 0;
uint32_t tapMutedUntilMs = 0;
uint32_t lastTapPollMs = 0;
uint32_t singleTapConfirmAtMs = 0;
uint32_t lastSingleTapEventMs = 0;
uint32_t motionCandidateStartedMs = 0;
uint32_t motionCandidateLastMs = 0;
uint32_t lastActivityMs = 0;
uint32_t lastImuInterruptMs = 0;
uint16_t latestGyroMagnitudeRaw = 0;

int32_t gyroXSum = 0;
int32_t gyroYSum = 0;
int32_t gyroZSum = 0;
uint32_t accelSumMg = 0;
uint16_t calibrationSamples = 0;
int16_t gyroBaselineX = 0;
int16_t gyroBaselineY = 0;
int16_t gyroBaselineZ = 0;
uint16_t accelBaselineMg = 1000;

uint16_t gyroPeakRaw = 0;
uint16_t accelPeakMg = 0;
uint16_t accelRiseMs = 0;
uint16_t maxAccelRiseMs = 0;
uint16_t accelTrendPeakMg = 0;
uint16_t firstGyroStrongTimeMs = kNoTimeMs;
uint32_t swingAccelAreaMgMs = 0;
uint8_t accelTrendFallCount = 0;
uint16_t bestScore = 0;
uint16_t swingCount = 0;
uint32_t scoreTotal = 0;
uint16_t scoreSampleCount = 0;
uint32_t lastMeasureSampleMs = 0;
uint32_t lastSwingMotionMs = 0;
uint32_t swingStartDecisionMs = 0;
uint16_t swingEndDecisionMs = 0;
uint8_t importedPreCaptureSampleCount = 0;
uint8_t preCaptureRingCountAtStart = 0;
uint8_t recentSampleCountAtStart = 0;
uint16_t recentSampleMaxAgeMsAtStart = 0;
uint16_t capturePeakStrength = 0;
uint32_t captureQuietStartedMs = 0;
bool swingStarted = false;
TapStatsStage tapStatsStage = TapStatsStage::None;
BestSwingSample captureSamples[kCaptureLogSampleCapacity] = {};
PreCaptureSample preCaptureSamples[kPreCaptureLogSampleCapacity] = {};
BestSwingSample telemetrySamplesToWrite[kCaptureLogSampleCapacity] = {};
uint8_t telemetrySampleSelected[kCaptureLogSampleCapacity] = {};
BestSwingTelemetryHeader telemetryHeaderToWrite = {};
uint16_t telemetryWriteIndex = 0;
uint16_t telemetryWriteByteCount = 0;
uint16_t telemetryWriteSampleBytes = 0;
bool telemetryWritePending = false;
uint8_t captureSampleWriteIndex = 0;
uint8_t captureSampleCount = 0;
uint16_t captureSampleTotal = 0;
uint8_t preCaptureSampleWriteIndex = 0;
uint8_t preCaptureSampleCount = 0;

void enterFinalSleep() {
  Display::off();
  Buzzer::off();
  Imu::enterSleepMode();

  set_sleep_mode(SLEEP_MODE_PWR_DOWN);
  sleep_enable();
  noInterrupts();
  for (;;) {
    sleep_cpu();
  }
}

void enterIdleSleep() {
  set_sleep_mode(SLEEP_MODE_IDLE);
  sleep_enable();
  noInterrupts();
  interrupts();
  sleep_cpu();
  sleep_disable();
}

bool isIdleTimedOut(uint32_t nowMs) {
  return static_cast<int32_t>(nowMs - (lastActivityMs + kAutoSleepIdleMs)) >= 0;
}

void clearPendingSingleTap() {
  singleTapConfirmAtMs = 0;
  lastSingleTapEventMs = 0;
}

void clearPendingTapEvents() {
  singleTapConfirmAtMs = 0;
  lastSingleTapEventMs = 0;
}

void clearTapStatsDisplay() {
  tapStatsStage = TapStatsStage::None;
  tapStatsUntilMs = 0;
}

bool isTapPollDue(uint32_t nowMs) {
  return static_cast<uint16_t>(nowMs - lastTapPollMs) >= kTapPollMs;
}

void queueSingleTap(uint32_t nowMs) {
  singleTapConfirmAtMs = nowMs + kSingleTapConfirmMs;
}

bool isSingleTapConfirmed(uint32_t nowMs) {
  return singleTapConfirmAtMs != 0 &&
         static_cast<int32_t>(nowMs - singleTapConfirmAtMs) >= 0;
}

uint16_t averageScoreOrZero() {
  if (scoreSampleCount == 0) {
    return 0;
  }
  return static_cast<uint16_t>(
      (scoreTotal + (scoreSampleCount / 2UL)) / scoreSampleCount);
}

void showAverageThenBest(uint32_t nowMs) {
  clearPendingTapEvents();
  lastActivityMs = nowMs;
  tapStatsStage = TapStatsStage::Average;
  tapStatsUntilMs = nowMs + kTapStatsDisplayMs;
  tapMutedUntilMs = nowMs + (kTapStatsDisplayMs * 2U) + kTapAcceptMuteMs;
  scoreUntilMs = nowMs + (kTapStatsDisplayMs * 2U);
  Display::showNumber(averageScoreOrZero(), nowMs, kTapStatsDisplayMs);
  runMode = RunMode::ShowingScore;
}

void updateTapStatsDisplay(uint32_t nowMs) {
  if (tapStatsStage == TapStatsStage::Average &&
      static_cast<int32_t>(nowMs - tapStatsUntilMs) >= 0) {
    tapStatsStage = TapStatsStage::Best;
    tapStatsUntilMs = nowMs + kTapStatsDisplayMs;
    Display::showNumber(bestScore, nowMs, kTapStatsDisplayMs);
    return;
  }

  if (tapStatsStage == TapStatsStage::Best &&
      static_cast<int32_t>(nowMs - tapStatsUntilMs) >= 0) {
    clearTapStatsDisplay();
  }
}

void updateDisplayService() {
  const uint32_t nowMs = millis();
  updateTapStatsDisplay(nowMs);
  Display::update(nowMs);
}

void showSwingCount(uint32_t nowMs) {
  clearPendingTapEvents();
  clearTapStatsDisplay();
  lastActivityMs = nowMs;
  Display::showNumber(swingCount, nowMs, kTapDisplayMs);
  scoreUntilMs = nowMs + kTapDisplayMs;
  tapMutedUntilMs = scoreUntilMs + kTapAcceptMuteMs;
  runMode = RunMode::ShowingScore;
}

bool isInterruptStalled(uint32_t nowMs) {
  return static_cast<uint16_t>(nowMs - lastImuInterruptMs) >= kIntStallClearMs;
}

uint32_t squareInt16(int16_t value) {
  const int32_t wideValue = value;
  return static_cast<uint32_t>(wideValue * wideValue);
}

uint16_t isqrt32(uint32_t value) {
  uint32_t bit = 1UL << 30;
  uint32_t result = 0;

  while (bit > value) {
    bit >>= 2;
  }

  while (bit != 0) {
    if (value >= result + bit) {
      value -= result + bit;
      result = (result >> 1) + bit;
    } else {
      result >>= 1;
    }
    bit >>= 2;
  }

  return static_cast<uint16_t>(result);
}

uint16_t magnitudeRaw(int16_t x, int16_t y, int16_t z) {
  return isqrt32(squareInt16(x) + squareInt16(y) + squareInt16(z));
}

uint16_t absDiff16(uint16_t a, uint16_t b) {
  return a > b ? a - b : b - a;
}

uint16_t saturateToUint16(uint32_t value) {
  return value > 65535 ? 65535 : static_cast<uint16_t>(value);
}

uint16_t scoreAccelDropThresholdMg(uint16_t accelPeakMg) {
  const uint16_t pctThreshold =
      static_cast<uint16_t>(
          (static_cast<uint32_t>(accelPeakMg) *
           (100U - kScoreAccelDropPct)) /
          100UL);
  return pctThreshold > kScoreAccelDropMinMg
             ? pctThreshold
             : kScoreAccelDropMinMg;
}

uint16_t scoreGyroDropThresholdRaw(uint16_t gyroPeakRaw) {
  const uint16_t pctThreshold =
      static_cast<uint16_t>(
          (static_cast<uint32_t>(gyroPeakRaw) *
           (100U - kScoreGyroDropPct)) /
          100UL);
  return pctThreshold > kScoreGyroDropMinRaw
             ? pctThreshold
             : kScoreGyroDropMinRaw;
}

void includeScoreWindowSample(ScoreWindow& window, const BestSwingSample& sample) {
  if (!window.hasSamples) {
    window.hasSamples = true;
    window.accelDropSeen = false;
    window.gyroDropSeen = false;
    window.startMs = sample.elapsedMs;
    window.gyroPeakMs = sample.elapsedMs;
    window.accelPeakMs = sample.elapsedMs;
    window.endMs = sample.elapsedMs;
    window.gyroEndMs = sample.elapsedMs;
    window.lastSampleMs = sample.elapsedMs;
    window.lastGyroSampleMs = sample.elapsedMs;
    window.gyroPeakRaw = sample.gyroRaw;
    window.accelPeakMg = sample.accelMg;
    return;
  }

  if (sample.elapsedMs < window.startMs) {
    window.startMs = sample.elapsedMs;
  }

  if (!window.accelDropSeen) {
    const int16_t previousSampleMs = window.lastSampleMs;
    if (sample.accelMg > window.accelPeakMg) {
      window.accelPeakMg = sample.accelMg;
      window.accelPeakMs = sample.elapsedMs;
    }
    window.lastSampleMs = sample.elapsedMs;

    if (sample.elapsedMs > window.accelPeakMs &&
        window.accelPeakMg > kSwingAccelAreaScoreOffsetMg &&
        window.accelPeakMg > sample.accelMg) {
      const uint16_t dropMg = window.accelPeakMg - sample.accelMg;
      if (dropMg >= scoreAccelDropThresholdMg(window.accelPeakMg)) {
        window.endMs =
            previousSampleMs > window.accelPeakMs ? previousSampleMs : window.accelPeakMs;
        window.accelDropSeen = true;
      } else {
        window.endMs = sample.elapsedMs;
      }
    } else {
      window.endMs = sample.elapsedMs;
    }
  }

  if (!window.gyroDropSeen) {
    const int16_t previousGyroSampleMs = window.lastGyroSampleMs;
    if (sample.gyroRaw > window.gyroPeakRaw) {
      window.gyroPeakRaw = sample.gyroRaw;
      window.gyroPeakMs = sample.elapsedMs;
    }
    window.lastGyroSampleMs = sample.elapsedMs;

    if (sample.elapsedMs > window.gyroPeakMs &&
        window.gyroPeakRaw > sample.gyroRaw) {
      const uint16_t dropRaw = window.gyroPeakRaw - sample.gyroRaw;
      if (dropRaw >= scoreGyroDropThresholdRaw(window.gyroPeakRaw)) {
        window.gyroEndMs =
            previousGyroSampleMs > window.gyroPeakMs
                ? previousGyroSampleMs
                : window.gyroPeakMs;
        window.gyroDropSeen = true;
      } else {
        window.gyroEndMs = sample.elapsedMs;
      }
    } else {
      window.gyroEndMs = sample.elapsedMs;
    }
  }
}

uint16_t gyroRawToDps(uint16_t gyroRaw) {
  return static_cast<uint16_t>(
      (static_cast<uint32_t>(gyroRaw) * kGyroMdpsPerLsb) / 1000UL);
}

uint8_t bestTelemetrySampleCapacity() {
  if (EEPROM.length() <= sizeof(BestSwingTelemetryHeader)) {
    return 0;
  }
  const size_t available = EEPROM.length() - sizeof(BestSwingTelemetryHeader);
  const size_t capacity = available / sizeof(BestSwingSample);
  return capacity > 255 ? 255 : static_cast<uint8_t>(capacity);
}

uint8_t checksumStep(uint8_t checksum, uint8_t value) {
  checksum ^= value;
  return static_cast<uint8_t>((checksum << 1) | (checksum >> 7));
}

uint8_t bestTelemetryChecksumFromEeprom(uint8_t sampleCount) {
  uint8_t checksum = 0xA5;
  const size_t byteCount =
      sizeof(BestSwingTelemetryHeader) +
      (static_cast<size_t>(sampleCount) * sizeof(BestSwingSample));
  for (size_t i = 0; i < byteCount; ++i) {
    const uint8_t value =
        i == offsetof(BestSwingTelemetryHeader, checksum)
            ? 0
            : EEPROM.read(static_cast<int>(i));
    checksum = checksumStep(checksum, value);
  }
  return checksum;
}

uint8_t bestTelemetryChecksumForWrite(
    const BestSwingTelemetryHeader& header,
    const BestSwingSample* samples) {
  uint8_t checksum = 0xA5;
  const uint8_t* headerBytes = reinterpret_cast<const uint8_t*>(&header);
  for (size_t i = 0; i < sizeof(BestSwingTelemetryHeader); ++i) {
    const uint8_t value =
        i == offsetof(BestSwingTelemetryHeader, checksum) ? 0 : headerBytes[i];
    checksum = checksumStep(checksum, value);
  }
  const uint8_t* sampleBytes = reinterpret_cast<const uint8_t*>(samples);
  const size_t sampleBytesCount =
      static_cast<size_t>(header.sampleCount) * sizeof(BestSwingSample);
  for (size_t i = 0; i < sampleBytesCount; ++i) {
    checksum = checksumStep(checksum, sampleBytes[i]);
  }
  return checksum;
}

uint8_t queuedTelemetryByteAt(uint16_t writeIndex) {
  if (writeIndex < telemetryWriteSampleBytes) {
    const uint8_t* sampleBytes =
        reinterpret_cast<const uint8_t*>(telemetrySamplesToWrite);
    return sampleBytes[writeIndex];
  }
  const uint8_t* headerBytes =
      reinterpret_cast<const uint8_t*>(&telemetryHeaderToWrite);
  return headerBytes[writeIndex - telemetryWriteSampleBytes];
}

size_t queuedTelemetryAddressAt(uint16_t writeIndex) {
  if (writeIndex < telemetryWriteSampleBytes) {
    return sizeof(BestSwingTelemetryHeader) + writeIndex;
  }
  return writeIndex - telemetryWriteSampleBytes;
}

void serviceBestSwingTelemetrySave(uint8_t maxBytes) {
  while (telemetryWritePending && maxBytes > 0) {
    EEPROM.update(
        static_cast<int>(queuedTelemetryAddressAt(telemetryWriteIndex)),
        queuedTelemetryByteAt(telemetryWriteIndex));
    ++telemetryWriteIndex;
    --maxBytes;
    if (telemetryWriteIndex >= telemetryWriteByteCount) {
      telemetryWritePending = false;
    }
  }
}

bool readBestSwingTelemetryHeader(BestSwingTelemetryHeader& header) {
  if (bestTelemetrySampleCapacity() == 0) {
    return false;
  }
  EEPROM.get(0, header);
  if (header.magic != kBestTelemetryMagic ||
      header.version != kBestTelemetryVersion ||
      header.sampleCount > bestTelemetrySampleCapacity()) {
    return false;
  }
  return header.checksum == bestTelemetryChecksumFromEeprom(header.sampleCount);
}

void printBestSwingTelemetryInvalidReason(const BestSwingTelemetryHeader& header) {
  Serial.print(F("status=no_valid_record reason="));
  if (header.magic != kBestTelemetryMagic) {
    Serial.print(F("magic_mismatch stored_magic=0x"));
    Serial.print(header.magic, HEX);
    Serial.print(F(" expected_magic=0x"));
    Serial.println(kBestTelemetryMagic, HEX);
    return;
  }

  if (header.version != kBestTelemetryVersion) {
    Serial.print(F("version_mismatch stored_version="));
    Serial.print(header.version);
    Serial.print(F(" expected_version="));
    Serial.println(kBestTelemetryVersion);
    return;
  }

  const uint8_t sampleCapacity = bestTelemetrySampleCapacity();
  if (header.sampleCount > sampleCapacity) {
    Serial.print(F("sample_count_invalid stored_samples="));
    Serial.print(header.sampleCount);
    Serial.print(F(" capacity="));
    Serial.println(sampleCapacity);
    return;
  }

  const uint8_t expectedChecksum =
      bestTelemetryChecksumFromEeprom(header.sampleCount);
  if (header.checksum != expectedChecksum) {
    Serial.print(F("checksum_mismatch stored_checksum=0x"));
    Serial.print(header.checksum, HEX);
    Serial.print(F(" expected_checksum=0x"));
    Serial.println(expectedChecksum, HEX);
    return;
  }

  Serial.println(F("unknown"));
}

BestSwingSample readBestSwingSample(uint8_t index) {
  BestSwingSample sample = {};
  EEPROM.get(
      static_cast<int>(
          sizeof(BestSwingTelemetryHeader) +
          (static_cast<size_t>(index) * sizeof(BestSwingSample))),
      sample);
  return sample;
}

void endBestSwingTelemetrySerial() {
  Serial.flush();
  Serial.end();
}

void printBestSwingTelemetryOnBoot() {
  Serial.begin(115200);
  delay(80);
  Serial.println();
  Serial.println(F("Dream best swing telemetry"));
  Serial.print(F("header_bytes="));
  Serial.print(sizeof(BestSwingTelemetryHeader));
  Serial.print(F(" sample_bytes="));
  Serial.print(sizeof(BestSwingSample));
  Serial.print(F(" eeprom_bytes="));
  Serial.print(EEPROM.length());
  Serial.print(F(" sample_capacity="));
  Serial.println(bestTelemetrySampleCapacity());

  if (bestTelemetrySampleCapacity() == 0) {
    Serial.println(F("status=record_does_not_fit_eeprom"));
    endBestSwingTelemetrySerial();
    return;
  }

  BestSwingTelemetryHeader telemetry = {};
  if (!readBestSwingTelemetryHeader(telemetry)) {
    printBestSwingTelemetryInvalidReason(telemetry);
    endBestSwingTelemetrySerial();
    return;
  }

  Serial.print(F("score="));
  Serial.print(telemetry.score);
  Serial.print(F(" swing_number="));
  Serial.print(telemetry.swingNumber);
  Serial.print(F(" average_before="));
  Serial.println(telemetry.averageBefore);

  Serial.print(F("duration_ms="));
  Serial.print(telemetry.swingDurationMs);
  Serial.print(F(" sample_total="));
  Serial.print(telemetry.sampleTotal);
  Serial.print(F(" stored_samples="));
  Serial.println(telemetry.sampleCount);

  Serial.print(F("time_origin=start_decision score_start_ms="));
  Serial.print(telemetry.scoreStartMs);
  Serial.print(F(" score_end_ms="));
  Serial.print(telemetry.scoreEndMs);
  Serial.print(F(" decision_end_ms="));
  Serial.println(telemetry.endDecisionMs);
  Serial.print(F("pre_samples="));
  Serial.println(telemetry.preSampleCount);
  Serial.print(F("pre_ring_count="));
  Serial.print(telemetry.preRingCount);
  Serial.print(F(" recent_samples="));
  Serial.print(telemetry.recentSampleCount);
  Serial.print(F(" recent_max_age_ms="));
  Serial.println(telemetry.recentMaxAgeMs);

  Serial.print(F("gyro_score="));
  Serial.println(telemetry.gyroScore);

  Serial.print(F("accel_area_mg_ms="));
  Serial.print(telemetry.accelAreaMgMs);
  Serial.print(F(" accel_score="));
  Serial.println(telemetry.accelScore);

  Serial.println(F("samples_csv=elapsed_ms,gyro_mag_raw,gyro_dps,dynamic_accel_mg"));
  for (uint8_t i = 0; i < telemetry.sampleCount; ++i) {
    const BestSwingSample sample = readBestSwingSample(i);
    Serial.print(sample.elapsedMs);
    Serial.print(',');
    Serial.print(sample.gyroRaw);
    Serial.print(',');
    Serial.print(gyroRawToDps(sample.gyroRaw));
    Serial.print(',');
    Serial.println(sample.accelMg);
  }
  endBestSwingTelemetrySerial();
}

void resetCaptureSamples() {
  for (uint8_t i = 0; i < kCaptureLogSampleCapacity; ++i) {
    captureSamples[i] = {};
  }
  captureSampleWriteIndex = 0;
  captureSampleCount = 0;
  captureSampleTotal = 0;
}

void recordCaptureSample(
    int16_t elapsedMs,
    uint16_t gyroMagnitudeRaw,
    uint16_t dynamicAccelMg) {
  captureSamples[captureSampleWriteIndex] = {
    elapsedMs,
    gyroMagnitudeRaw,
    dynamicAccelMg,
  };
  captureSampleWriteIndex =
      static_cast<uint8_t>((captureSampleWriteIndex + 1U) % kCaptureLogSampleCapacity);
  if (captureSampleCount < kCaptureLogSampleCapacity) {
    ++captureSampleCount;
  }
  if (captureSampleTotal < 65535) {
    ++captureSampleTotal;
  }
}

void resetPreCaptureSamples() {
  for (uint8_t i = 0; i < kPreCaptureLogSampleCapacity; ++i) {
    preCaptureSamples[i] = {};
  }
  preCaptureSampleWriteIndex = 0;
  preCaptureSampleCount = 0;
}

void recordPreCaptureSample(
    uint32_t nowMs,
    uint16_t gyroMagnitudeRaw,
    uint16_t dynamicAccelMg) {
  preCaptureSamples[preCaptureSampleWriteIndex] = {
    nowMs,
    gyroMagnitudeRaw,
    dynamicAccelMg,
  };
  preCaptureSampleWriteIndex =
      static_cast<uint8_t>(
          (preCaptureSampleWriteIndex + 1U) % kPreCaptureLogSampleCapacity);
  if (preCaptureSampleCount < kPreCaptureLogSampleCapacity) {
    ++preCaptureSampleCount;
  }
}

PreCaptureSample preCaptureSampleAt(uint8_t chronologicalIndex) {
  const uint8_t startIndex =
      preCaptureSampleCount == kPreCaptureLogSampleCapacity
          ? preCaptureSampleWriteIndex
          : 0;
  const uint8_t sourceIndex =
      static_cast<uint8_t>(
          (startIndex + chronologicalIndex) % kPreCaptureLogSampleCapacity);
  return preCaptureSamples[sourceIndex];
}

void importRecentMotionSnapshots() {
  const uint8_t snapshotCount = Imu::recentMotionSnapshotCount();
  recentSampleCountAtStart = snapshotCount;
  recentSampleMaxAgeMsAtStart = 0;
  for (uint8_t i = 0; i < snapshotCount; ++i) {
    Imu::MotionSnapshot snapshot = {};
    if (!Imu::recentMotionSnapshot(i, snapshot)) {
      continue;
    }
    if (snapshot.ageMs > recentSampleMaxAgeMsAtStart) {
      recentSampleMaxAgeMsAtStart = snapshot.ageMs;
    }
    if (snapshot.ageMs == 0 || snapshot.ageMs > kPreCaptureTelemetryMs) {
      continue;
    }

    const int16_t dynamicGyroXRaw =
        static_cast<int16_t>(snapshot.gyroXRaw - gyroBaselineX);
    const int16_t dynamicGyroYRaw =
        static_cast<int16_t>(snapshot.gyroYRaw - gyroBaselineY);
    const int16_t dynamicGyroZRaw =
        static_cast<int16_t>(snapshot.gyroZRaw - gyroBaselineZ);
    const uint16_t gyroMagnitudeRaw =
        magnitudeRaw(dynamicGyroXRaw, dynamicGyroYRaw, dynamicGyroZRaw);
    const uint16_t dynamicAccelMg =
        absDiff16(snapshot.accelMagnitudeMg, accelBaselineMg);
    recordCaptureSample(
        -static_cast<int16_t>(snapshot.ageMs),
        gyroMagnitudeRaw,
        dynamicAccelMg);
    if (importedPreCaptureSampleCount < 255) {
      ++importedPreCaptureSampleCount;
    }
  }
}

void importPreCaptureSamples(uint32_t startDecisionMs) {
  importedPreCaptureSampleCount = 0;
  preCaptureRingCountAtStart = preCaptureSampleCount;
  for (uint8_t i = 0; i < preCaptureSampleCount; ++i) {
    const PreCaptureSample sample = preCaptureSampleAt(i);
    const int32_t ageMs =
        static_cast<int32_t>(startDecisionMs - sample.sampledMs);
    if (ageMs > 0 && ageMs <= kPreCaptureTelemetryMs) {
      recordCaptureSample(
          -static_cast<int16_t>(ageMs),
          sample.gyroRaw,
          sample.accelMg);
      if (importedPreCaptureSampleCount < 255) {
        ++importedPreCaptureSampleCount;
      }
    }
  }
  importRecentMotionSnapshots();
}

BestSwingSample captureSampleAt(uint8_t chronologicalIndex) {
  const uint8_t startIndex =
      captureSampleCount == kCaptureLogSampleCapacity ? captureSampleWriteIndex : 0;
  const uint8_t sourceIndex =
      static_cast<uint8_t>((startIndex + chronologicalIndex) % kCaptureLogSampleCapacity);
  return captureSamples[sourceIndex];
}

void clearTelemetrySampleSelected();

ScoreWindow scoreWindowFromCaptureSamples() {
  ScoreWindow window = {};
  clearTelemetrySampleSelected();
  for (uint8_t processed = 0; processed < captureSampleCount; ++processed) {
    bool found = false;
    uint8_t bestIndex = 0;
    BestSwingSample bestSample = {};
    for (uint8_t i = 0; i < captureSampleCount; ++i) {
      if (telemetrySampleSelected[i] != 0) {
        continue;
      }
      const BestSwingSample sample = captureSampleAt(i);
      if (!found || sample.elapsedMs < bestSample.elapsedMs) {
        found = true;
        bestIndex = i;
        bestSample = sample;
      }
    }
    if (!found) {
      break;
    }

    telemetrySampleSelected[bestIndex] = 1;
    includeScoreWindowSample(window, bestSample);
    if (window.accelDropSeen && window.gyroDropSeen) {
      break;
    }
  }
  clearTelemetrySampleSelected();
  return window;
}

void preserveCaptureSamplesForRestart(uint32_t newStartDecisionMs) {
  if (!swingStarted || swingStartDecisionMs == 0) {
    return;
  }

  for (uint8_t i = 0; i < captureSampleCount; ++i) {
    const BestSwingSample sample = captureSampleAt(i);
    const int32_t sampleTimeMs =
        static_cast<int32_t>(swingStartDecisionMs) +
        static_cast<int32_t>(sample.elapsedMs);
    if (sampleTimeMs < 0 ||
        sampleTimeMs >= static_cast<int32_t>(newStartDecisionMs)) {
      continue;
    }
    const uint32_t ageMs =
        newStartDecisionMs - static_cast<uint32_t>(sampleTimeMs);
    if (ageMs <= kPreCaptureTelemetryMs) {
      recordPreCaptureSample(
          static_cast<uint32_t>(sampleTimeMs),
          sample.gyroRaw,
          sample.accelMg);
    }
  }
}

void resetTelemetrySampleSelection() {
  for (uint8_t i = 0; i < kCaptureLogSampleCapacity; ++i) {
    telemetrySamplesToWrite[i] = {};
    telemetrySampleSelected[i] = 0;
  }
}

void clearTelemetrySampleSelected() {
  for (uint8_t i = 0; i < kCaptureLogSampleCapacity; ++i) {
    telemetrySampleSelected[i] = 0;
  }
}

bool selectTelemetrySourceSample(
    uint8_t sourceIndex,
    uint8_t sampleCount,
    uint8_t& selectedCount) {
  if (sourceIndex >= captureSampleCount || selectedCount >= sampleCount ||
      telemetrySampleSelected[sourceIndex] != 0) {
    return false;
  }
  telemetrySampleSelected[sourceIndex] = 1;
  ++selectedCount;
  return true;
}

void findPeakCaptureSampleIndexes(
    uint8_t& gyroPeakIndex,
    uint8_t& accelPeakIndex) {
  gyroPeakIndex = 0;
  accelPeakIndex = 0;
  uint16_t maxGyroRaw = 0;
  uint16_t maxAccelMg = 0;
  for (uint8_t i = 0; i < captureSampleCount; ++i) {
    const BestSwingSample sample = captureSampleAt(i);
    if (sample.gyroRaw > maxGyroRaw) {
      maxGyroRaw = sample.gyroRaw;
      gyroPeakIndex = i;
    }
    if (sample.accelMg > maxAccelMg) {
      maxAccelMg = sample.accelMg;
      accelPeakIndex = i;
    }
  }
}

void copyTelemetrySamples(uint8_t sampleCount) {
  resetTelemetrySampleSelection();
  if (sampleCount == 0) {
    return;
  }
  if (captureSampleCount <= sampleCount) {
    for (uint8_t i = 0; i < sampleCount; ++i) {
      telemetrySamplesToWrite[i] = captureSampleAt(i);
    }
    return;
  }

  uint8_t gyroPeakIndex = 0;
  uint8_t accelPeakIndex = 0;
  findPeakCaptureSampleIndexes(gyroPeakIndex, accelPeakIndex);

  uint8_t selectedCount = 0;
  selectTelemetrySourceSample(gyroPeakIndex, sampleCount, selectedCount);
  selectTelemetrySourceSample(accelPeakIndex, sampleCount, selectedCount);
  selectTelemetrySourceSample(0, sampleCount, selectedCount);
  selectTelemetrySourceSample(
      static_cast<uint8_t>(captureSampleCount - 1U),
      sampleCount,
      selectedCount);

  if (sampleCount > 1) {
    for (uint8_t i = 0; i < sampleCount && selectedCount < sampleCount; ++i) {
      const uint8_t sourceIndex = static_cast<uint8_t>(
          ((static_cast<uint32_t>(i) * (captureSampleCount - 1U)) +
           ((sampleCount - 1U) / 2U)) /
          (sampleCount - 1U));
      selectTelemetrySourceSample(sourceIndex, sampleCount, selectedCount);
    }
  }

  for (uint8_t sourceIndex = 0;
       sourceIndex < captureSampleCount && selectedCount < sampleCount;
       ++sourceIndex) {
    selectTelemetrySourceSample(sourceIndex, sampleCount, selectedCount);
  }

  uint8_t writeIndex = 0;
  for (uint8_t sourceIndex = 0;
       sourceIndex < captureSampleCount && writeIndex < sampleCount;
       ++sourceIndex) {
    if (telemetrySampleSelected[sourceIndex] != 0) {
      telemetrySamplesToWrite[writeIndex] = captureSampleAt(sourceIndex);
      ++writeIndex;
    }
  }
}

void sortTelemetrySamplesByElapsed(uint8_t sampleCount) {
  for (uint8_t i = 1; i < sampleCount; ++i) {
    const BestSwingSample sample = telemetrySamplesToWrite[i];
    uint8_t j = i;
    while (j > 0 && telemetrySamplesToWrite[j - 1].elapsedMs > sample.elapsedMs) {
      telemetrySamplesToWrite[j] = telemetrySamplesToWrite[j - 1];
      --j;
    }
    telemetrySamplesToWrite[j] = sample;
  }
}

uint8_t batteryPercentFromMillivolts(uint16_t millivolts) {
  if (millivolts >= kBatteryFullMv) {
    return 100;
  }
  if (millivolts <= kBatteryEmptyMv) {
    return 0;
  }

  const uint32_t spanMv = kBatteryFullMv - kBatteryEmptyMv;
  const uint32_t aboveEmptyMv = millivolts - kBatteryEmptyMv;
  return static_cast<uint8_t>((aboveEmptyMv * 100UL + (spanMv / 2)) / spanMv);
}

void resetCalibration() {
  gyroXSum = 0;
  gyroYSum = 0;
  gyroZSum = 0;
  accelSumMg = 0;
  calibrationSamples = 0;
}

void finishCalibration() {
  if (calibrationSamples != 0) {
    gyroBaselineX = static_cast<int16_t>(gyroXSum / calibrationSamples);
    gyroBaselineY = static_cast<int16_t>(gyroYSum / calibrationSamples);
    gyroBaselineZ = static_cast<int16_t>(gyroZSum / calibrationSamples);
    accelBaselineMg = static_cast<uint16_t>(accelSumMg / calibrationSamples);
  }
  Display::off();
  tapMutedUntilMs = millis() + kTapMuteAfterStartupMs;
  lastImuInterruptMs = millis();
  lastActivityMs = millis();
  resetPreCaptureSamples();
  runMode = RunMode::Monitor;
}

void resetMeasurement() {
  gyroPeakRaw = 0;
  accelPeakMg = 0;
  accelRiseMs = 0;
  maxAccelRiseMs = 0;
  accelTrendPeakMg = 0;
  firstGyroStrongTimeMs = kNoTimeMs;
  swingAccelAreaMgMs = 0;
  accelTrendFallCount = 0;
  lastMeasureSampleMs = 0;
  lastSwingMotionMs = 0;
  swingStartDecisionMs = 0;
  swingEndDecisionMs = 0;
  importedPreCaptureSampleCount = 0;
  preCaptureRingCountAtStart = 0;
  recentSampleCountAtStart = 0;
  recentSampleMaxAgeMsAtStart = 0;
  capturePeakStrength = 0;
  captureQuietStartedMs = 0;
  swingStarted = false;
  swingStartedMs = 0;
  motionCandidateStartedMs = 0;
  motionCandidateLastMs = 0;
  resetCaptureSamples();
}

void startCapture(
    uint32_t nowMs,
    uint16_t strength,
    uint32_t startedMs,
    bool includePreCaptureSamples) {
  Display::off();
  clearPendingTapEvents();
  clearTapStatsDisplay();
  if (includePreCaptureSamples) {
    preserveCaptureSamplesForRestart(nowMs);
  }
  resetMeasurement();
  swingStarted = true;
  swingStartedMs = startedMs;
  swingStartDecisionMs = nowMs;
  if (includePreCaptureSamples) {
    importPreCaptureSamples(nowMs);
  }
  lastMeasureSampleMs = nowMs;
  lastSwingMotionMs = nowMs;
  capturePeakStrength = strength;
  captureQuietStartedMs = 0;
  motionCandidateStartedMs = 0;
  motionCandidateLastMs = 0;
  runMode = RunMode::Capturing;
}

uint16_t gyroPeakScore() {
  const uint32_t gyroPeakDps =
      (static_cast<uint32_t>(gyroPeakRaw) * kGyroMdpsPerLsb) / 1000UL;
  const uint32_t clampedDps =
      gyroPeakDps > kGyroPeakFullDps ? kGyroPeakFullDps : gyroPeakDps;
  return static_cast<uint16_t>(
      (clampedDps * kGyroPeakScoreMax) / kGyroPeakFullDps);
}

uint16_t swingAccelAreaScore() {
  const uint32_t clampedArea =
      swingAccelAreaMgMs > kSwingAccelAreaFullMgMs
          ? kSwingAccelAreaFullMgMs
          : swingAccelAreaMgMs;
  return static_cast<uint16_t>(
      (clampedArea * kSwingAccelAreaScoreMax) /
      kSwingAccelAreaFullMgMs);
}

uint16_t activeSwingDurationMs(uint32_t nowMs) {
  const uint32_t endMs = lastSwingMotionMs != 0 ? lastSwingMotionMs : nowMs;
  uint32_t durationMs = endMs - swingStartedMs;
  if (durationMs > 65535) {
    durationMs = 65535;
  }
  return static_cast<uint16_t>(durationMs);
}

uint16_t scoreFromComponents(uint16_t gyroScore, uint16_t accelScore) {
  uint32_t score = gyroScore;
  score += accelScore;
  if (score > kInternalScoreMax) {
    score = kInternalScoreMax;
  }
  return static_cast<uint16_t>(score);
}

void queueBestSwingTelemetrySave(
    uint16_t score,
    uint16_t swingNumber,
    uint16_t averageBefore,
    uint16_t swingDurationMs,
    uint16_t gyroScore,
    uint16_t accelScore) {
  const uint8_t sampleCapacity = bestTelemetrySampleCapacity();
  if (sampleCapacity == 0) {
    return;
  }

  uint8_t sampleCount = captureSampleCount;
  if (sampleCount > sampleCapacity) {
    sampleCount = sampleCapacity;
  }
  if (sampleCount > kCaptureLogSampleCapacity) {
    sampleCount = kCaptureLogSampleCapacity;
  }
  copyTelemetrySamples(sampleCount);
  sortTelemetrySamplesByElapsed(sampleCount);
  const ScoreWindow scoreWindow = scoreWindowFromCaptureSamples();

  telemetryHeaderToWrite = {};
  telemetryHeaderToWrite.magic = kBestTelemetryMagic;
  telemetryHeaderToWrite.version = kBestTelemetryVersion;
  telemetryHeaderToWrite.sampleCount = sampleCount;
  telemetryHeaderToWrite.sampleTotal = captureSampleTotal;
  telemetryHeaderToWrite.score = score;
  telemetryHeaderToWrite.swingNumber = swingNumber;
  telemetryHeaderToWrite.averageBefore = averageBefore;
  telemetryHeaderToWrite.swingDurationMs = swingDurationMs;
  telemetryHeaderToWrite.endDecisionMs = swingEndDecisionMs;
  telemetryHeaderToWrite.scoreStartMs =
      scoreWindow.hasSamples ? scoreWindow.startMs : 0;
  telemetryHeaderToWrite.scoreEndMs =
      scoreWindow.hasSamples ? scoreWindow.endMs : telemetryHeaderToWrite.scoreStartMs;
  telemetryHeaderToWrite.preSampleCount = importedPreCaptureSampleCount;
  telemetryHeaderToWrite.preRingCount = preCaptureRingCountAtStart;
  telemetryHeaderToWrite.recentSampleCount = recentSampleCountAtStart;
  telemetryHeaderToWrite.recentMaxAgeMs = recentSampleMaxAgeMsAtStart;
  telemetryHeaderToWrite.accelAreaMgMs = swingAccelAreaMgMs;
  telemetryHeaderToWrite.gyroScore = gyroScore;
  telemetryHeaderToWrite.accelScore = accelScore;
  telemetryHeaderToWrite.checksum =
      bestTelemetryChecksumForWrite(telemetryHeaderToWrite, telemetrySamplesToWrite);

  telemetryWriteIndex = 0;
  telemetryWriteSampleBytes =
      static_cast<uint16_t>(sampleCount) * sizeof(BestSwingSample);
  telemetryWriteByteCount =
      telemetryWriteSampleBytes + sizeof(BestSwingTelemetryHeader);
  telemetryWritePending = telemetryWriteByteCount != 0;
}

void finishMeasurement(uint32_t nowMs, uint16_t score) {
  clearTapStatsDisplay();
  Display::showNumber(score, nowMs, kScoreDisplayMs);
  scoreUntilMs = nowMs + kScoreDisplayMs;
  tapMutedUntilMs = scoreUntilMs + kTapMuteAfterScoreMs;
  runMode = RunMode::ShowingScore;
}

void finishNoSwing() {
  Display::off();
  cooldownUntilMs = millis() + kCaptureDiscardCooldownMs;
  runMode = RunMode::Cooldown;
}

bool isCaptureStartMotion(
    uint32_t strength, uint16_t gyroMagnitudeRaw, uint16_t dynamicAccelMg) {
  return strength >= kCaptureStartStrength &&
         (gyroMagnitudeRaw >= kCaptureStartGyroRaw ||
          dynamicAccelMg >= kCaptureStartAccelMg);
}

void updateMotionCandidate(uint32_t strength, uint32_t nowMs) {
  if (strength >= kActivityStrengthThreshold) {
    if (motionCandidateStartedMs == 0) {
      motionCandidateStartedMs = nowMs;
    }
    motionCandidateLastMs = nowMs;
    return;
  }

  if (motionCandidateLastMs != 0 &&
      static_cast<uint16_t>(nowMs - motionCandidateLastMs) >= kPreCaptureQuietMs) {
    motionCandidateStartedMs = 0;
    motionCandidateLastMs = 0;
  }
}

uint32_t captureStartTimeFor(uint32_t nowMs) {
  return motionCandidateStartedMs != 0 ? motionCandidateStartedMs : nowMs;
}

void handleMonitorTapEvent(TapEvent tapEvent, uint32_t nowMs) {
  if (tapEvent == TapEvent::Double) {
    showAverageThenBest(nowMs);
    return;
  }

  if (tapEvent == TapEvent::Single) {
    if (lastSingleTapEventMs != 0 &&
        static_cast<uint16_t>(nowMs - lastSingleTapEventMs) < kDoubleTapMinGapMs) {
      return;
    }
    lastSingleTapEventMs = nowMs;

    if (singleTapConfirmAtMs != 0 &&
        static_cast<int32_t>(singleTapConfirmAtMs - nowMs) > 0) {
      showAverageThenBest(nowMs);
      return;
    }

    if (isSingleTapConfirmed(nowMs)) {
      clearPendingTapEvents();
    }
    queueSingleTap(nowMs);
    return;
  }

  if (isSingleTapConfirmed(nowMs)) {
    clearPendingSingleTap();
    showSwingCount(nowMs);
  }
}

uint8_t swingEvidence(uint16_t swingDurationMs) {
  uint8_t evidence = 0;

  if (swingDurationMs >= kMinAcceptedSwingDurationMs) {
    evidence += 2;
  } else if (swingDurationMs >= kShortSwingDurationMs) {
    evidence += 1;
  }

  if (gyroPeakRaw >= kGyroRiseThresholdRaw) {
    evidence += 2;
  }
  if (accelPeakMg >= kSwingAccelAreaScoreOffsetMg * 2U) {
    evidence += 2;
  } else if (accelPeakMg >= kSwingAccelAreaScoreOffsetMg) {
    evidence += 1;
  }

  if (maxAccelRiseMs >= kGyroRiseGoodMs) {
    evidence += 2;
  } else if (maxAccelRiseMs >= kGyroRiseTooFastMs) {
    evidence += 1;
  }

  if (firstGyroStrongTimeMs != kNoTimeMs) {
    evidence += 1;
  }

  if (capturePeakStrength >= kCaptureRestartStrength) {
    evidence += 1;
  }

  return evidence;
}

void updateAccelRise(uint16_t dynamicAccelMg, uint16_t sampleDeltaMs) {
  if (dynamicAccelMg < kAccelRiseStartMg) {
    accelRiseMs = 0;
    accelTrendPeakMg = dynamicAccelMg;
    accelTrendFallCount = 0;
    return;
  }

  if (accelRiseMs == 0) {
    accelTrendPeakMg = dynamicAccelMg;
    accelTrendFallCount = 0;
  } else if (dynamicAccelMg > accelTrendPeakMg + kAccelTrendNoiseMg) {
    accelTrendPeakMg = dynamicAccelMg;
    accelTrendFallCount = 0;
  } else if (dynamicAccelMg + kAccelTrendNoiseMg < accelTrendPeakMg) {
    if (accelTrendFallCount < 255) {
      ++accelTrendFallCount;
    }
  } else {
    accelTrendFallCount = 0;
  }

  const uint32_t nextRiseMs =
      static_cast<uint32_t>(accelRiseMs) + sampleDeltaMs;
  accelRiseMs =
      nextRiseMs > 65535 ? 65535 : static_cast<uint16_t>(nextRiseMs);
  if (accelRiseMs > maxAccelRiseMs) {
    maxAccelRiseMs = accelRiseMs;
  }

  if (accelTrendFallCount >= kAccelTrendFallSamples) {
    accelRiseMs = 0;
    accelTrendPeakMg = dynamicAccelMg;
    accelTrendFallCount = 0;
  }
}

void resetSwingScoreMetrics() {
  gyroPeakRaw = 0;
  accelPeakMg = 0;
  accelRiseMs = 0;
  maxAccelRiseMs = 0;
  accelTrendPeakMg = 0;
  firstGyroStrongTimeMs = kNoTimeMs;
  swingAccelAreaMgMs = 0;
  accelTrendFallCount = 0;
  capturePeakStrength = 0;
}

void updateSwingScoreMetrics(
    uint16_t gyroMagnitudeRaw,
    uint16_t dynamicAccelMg,
    uint16_t strength,
    uint16_t elapsedMs,
    uint16_t sampleDeltaMs,
    bool includeGyroPeak,
    bool includeAccelArea) {
  if (includeGyroPeak) {
    if (gyroMagnitudeRaw > gyroPeakRaw) {
      gyroPeakRaw = gyroMagnitudeRaw;
    }
    if (gyroMagnitudeRaw >= kGyroRiseThresholdRaw &&
        firstGyroStrongTimeMs == kNoTimeMs) {
      firstGyroStrongTimeMs = elapsedMs;
    }
  }
  if (includeAccelArea && dynamicAccelMg > accelPeakMg) {
    accelPeakMg = dynamicAccelMg;
  }
  if (includeAccelArea &&
      dynamicAccelMg > kSwingAccelAreaScoreOffsetMg &&
      sampleDeltaMs != 0) {
    const uint16_t effectiveAccelMg =
        dynamicAccelMg - kSwingAccelAreaScoreOffsetMg;
    swingAccelAreaMgMs +=
        static_cast<uint32_t>(effectiveAccelMg) * sampleDeltaMs;
  }
  if (includeAccelArea) {
    updateAccelRise(dynamicAccelMg, sampleDeltaMs);
  }
  if ((includeGyroPeak || includeAccelArea) && strength > capturePeakStrength) {
    capturePeakStrength = strength;
  }
}

void updateCapturePeaks(
    uint16_t gyroMagnitudeRaw,
    uint16_t dynamicAccelMg,
    uint16_t strength,
    uint32_t nowMs) {
  const uint16_t elapsedMs = static_cast<uint16_t>(nowMs - swingStartedMs);
  const uint16_t sampleDeltaMs =
      lastMeasureSampleMs == 0 ? 0 : static_cast<uint16_t>(nowMs - lastMeasureSampleMs);
  lastMeasureSampleMs = nowMs;
  recordCaptureSample(
      static_cast<int16_t>(nowMs - swingStartDecisionMs),
      gyroMagnitudeRaw,
      dynamicAccelMg);

  updateSwingScoreMetrics(
      gyroMagnitudeRaw,
      dynamicAccelMg,
      strength,
      elapsedMs,
      sampleDeltaMs,
      true,
      true);
  if (dynamicAccelMg >= kAccelRiseStartMg) {
    lastSwingMotionMs = nowMs;
  }
  if (strength >= kCaptureStartStrength) {
    lastSwingMotionMs = nowMs;
  }
}

bool elapsedFromScoreStart(
    int16_t decisionElapsedMs,
    int16_t scoreStartMs,
    uint16_t& elapsedMs) {
  const int32_t elapsed =
      static_cast<int32_t>(decisionElapsedMs) -
      static_cast<int32_t>(scoreStartMs);
  if (elapsed < 0 || elapsed > 65535) {
    return false;
  }
  elapsedMs = static_cast<uint16_t>(elapsed);
  return true;
}

void recalculateSwingScoreMetrics() {
  resetSwingScoreMetrics();
  clearTelemetrySampleSelected();
  const ScoreWindow scoreWindow = scoreWindowFromCaptureSamples();
  const int16_t scoreStartMs = scoreWindow.hasSamples ? scoreWindow.startMs : 0;
  const int16_t scoreEndMs = scoreWindow.hasSamples ? scoreWindow.endMs : 0;
  const int16_t accelAreaEndMs = scoreEndMs;
  const int16_t gyroScoreEndMs =
      scoreWindow.hasSamples ? scoreWindow.gyroEndMs : scoreEndMs;

  bool hasPrevious = false;
  uint16_t previousElapsedMs = 0;
  for (uint8_t processed = 0; processed < captureSampleCount; ++processed) {
    bool found = false;
    uint8_t bestIndex = 0;
    BestSwingSample bestSample = {};
    for (uint8_t i = 0; i < captureSampleCount; ++i) {
      if (telemetrySampleSelected[i] != 0) {
        continue;
      }
      const BestSwingSample sample = captureSampleAt(i);
      if (!found || sample.elapsedMs < bestSample.elapsedMs) {
        found = true;
        bestIndex = i;
        bestSample = sample;
      }
    }
    if (!found) {
      break;
    }

    telemetrySampleSelected[bestIndex] = 1;
    const bool includeGyroPeak = bestSample.elapsedMs <= gyroScoreEndMs;
    const bool includeAccelArea = bestSample.elapsedMs <= accelAreaEndMs;
    if (!includeGyroPeak && !includeAccelArea) {
      break;
    }

    uint16_t elapsedMs = 0;
    if (!elapsedFromScoreStart(bestSample.elapsedMs, scoreStartMs, elapsedMs)) {
      continue;
    }

    uint16_t sampleDeltaMs = 0;
    if (hasPrevious && elapsedMs > previousElapsedMs) {
      sampleDeltaMs = static_cast<uint16_t>(elapsedMs - previousElapsedMs);
    }
    const uint32_t strength =
        static_cast<uint32_t>(bestSample.gyroRaw) +
        static_cast<uint32_t>(bestSample.accelMg) * 4UL;
    updateSwingScoreMetrics(
        bestSample.gyroRaw,
        bestSample.accelMg,
        saturateToUint16(strength),
        elapsedMs,
        sampleDeltaMs,
        includeGyroPeak,
        includeAccelArea);
    previousElapsedMs = elapsedMs;
    hasPrevious = true;
  }

  clearTelemetrySampleSelected();
}

bool isCaptureFinished(uint16_t strength, uint32_t nowMs) {
  const uint16_t elapsedMs = static_cast<uint16_t>(nowMs - swingStartedMs);
  if (elapsedMs >= kCaptureMaxMs) {
    return true;
  }
  if (elapsedMs < kCaptureMinMs) {
    return false;
  }

  const uint32_t endThreshold =
      (static_cast<uint32_t>(capturePeakStrength) * kCaptureEndDropPct) / 100UL;
  if (strength <= endThreshold) {
    if (captureQuietStartedMs == 0) {
      captureQuietStartedMs = nowMs;
    }
    return static_cast<uint16_t>(nowMs - captureQuietStartedMs) >= kCaptureEndQuietMs;
  }

  captureQuietStartedMs = 0;
  return false;
}

void finishCapture(uint32_t nowMs) {
  const uint16_t swingDurationMs = activeSwingDurationMs(nowMs);
  const uint32_t decisionElapsedMs = nowMs - swingStartDecisionMs;
  swingEndDecisionMs =
      decisionElapsedMs > 65535 ? 65535 : static_cast<uint16_t>(decisionElapsedMs);
  recalculateSwingScoreMetrics();
  const uint8_t evidence = swingEvidence(swingDurationMs);
  if (evidence < kMinSwingEvidence) {
    finishNoSwing();
    return;
  }
  const uint16_t gyroScore = gyroPeakScore();
  const uint16_t accelScore = swingAccelAreaScore();
  const uint16_t score = scoreFromComponents(gyroScore, accelScore);
  if (score < kMinDisplayScore) {
    finishNoSwing();
    return;
  }

  const uint16_t displayScore = score;
  const uint16_t averageScore =
      scoreSampleCount != 0
          ? static_cast<uint16_t>((scoreTotal + (scoreSampleCount / 2UL)) /
                                  scoreSampleCount)
          : score;
  const bool aboveAverage = score >= averageScore;
  const bool newBest = score > bestScore;
  if (newBest) {
    bestScore = score;
  }
  const uint16_t nextSwingCount = swingCount < 999 ? swingCount + 1 : swingCount;
  if (newBest) {
    queueBestSwingTelemetrySave(
        score,
        nextSwingCount,
        averageScore,
        swingDurationMs,
        gyroScore,
        accelScore);
  }
  if (swingCount < 999) {
    ++swingCount;
  }
  if (scoreSampleCount < 65535) {
    ++scoreSampleCount;
    scoreTotal += score;
  }
  if (swingCount % kMilestoneSwingInterval == 0) {
    Buzzer::milestoneBeep(micros());
  } else if (newBest) {
    Buzzer::beep(3, micros());
  } else if (aboveAverage) {
    Buzzer::beep(2, micros());
  } else {
    Buzzer::beep(1, micros());
  }
  finishMeasurement(nowMs, displayScore);
}

}  // namespace

void setup() {
  printBestSwingTelemetryOnBoot();
  Buzzer::begin();
  Display::begin();
  Imu::begin();

  resetCalibration();
  calibrationUntilMs = millis() + kGyroCalibrationWindowMs;
  Display::showNumber(
      batteryPercentFromMillivolts(readSupplyVoltage()), millis(), kGyroCalibrationWindowMs);
  runMode = RunMode::Calibrate;
}

void loop() {
  const uint32_t nowMs = millis();
  const uint32_t nowUs = micros();

  Buzzer::update(nowUs);
  if (Buzzer::isActive()) {
    return;
  }
  updateDisplayService();

  if (runMode == RunMode::ShowingScore) {
    if (isTapPollDue(nowMs)) {
      lastTapPollMs = nowMs;
      Imu::readTapEvent();
    } else {
      enterIdleSleep();
    }
    if (static_cast<int32_t>(nowMs - scoreUntilMs) >= 0) {
      runMode = RunMode::Monitor;
    }
    return;
  }

  if (runMode == RunMode::Cooldown) {
    if (isTapPollDue(nowMs)) {
      lastTapPollMs = nowMs;
      Imu::readTapEvent();
    } else {
      enterIdleSleep();
    }
    if (static_cast<int32_t>(nowMs - cooldownUntilMs) >= 0) {
      runMode = RunMode::Monitor;
    }
    return;
  }

  if (runMode == RunMode::Monitor) {
    if (static_cast<int32_t>(nowMs - tapMutedUntilMs) < 0) {
      if (isTapPollDue(nowMs)) {
        lastTapPollMs = nowMs;
        Imu::readTapEvent();
      }
    } else if (isTapPollDue(nowMs)) {
      lastTapPollMs = nowMs;
      const TapEvent tapEvent = Imu::readTapEvent();
      handleMonitorTapEvent(tapEvent, nowMs);
      if (tapEvent != TapEvent::None) {
        return;
      }
      if (runMode != RunMode::Monitor) {
        return;
      }
    }
  }

  const bool imuInterrupted = Imu::consumeInterruptCount() != 0;
  if (imuInterrupted) {
    lastImuInterruptMs = nowMs;
  }
  const bool forceImuRead =
      !imuInterrupted && runMode != RunMode::Calibrate && isInterruptStalled(nowMs);
  if (!imuInterrupted && runMode != RunMode::Calibrate && !forceImuRead) {
    if (runMode == RunMode::Monitor) {
      if (isIdleTimedOut(nowMs) && !telemetryWritePending) {
        enterFinalSleep();
      }
      if (!Display::isOn(nowMs)) {
        serviceBestSwingTelemetrySave(kTelemetryEepromBytesPerService);
      }
      enterIdleSleep();
    }
    return;
  }
  if (forceImuRead) {
    lastImuInterruptMs = nowMs;
  }

  uint16_t accelMagnitudeMg = 0;
  int16_t gyroXRaw = 0;
  int16_t gyroYRaw = 0;
  int16_t gyroZRaw = 0;
  Imu::readMotionSample(accelMagnitudeMg, gyroXRaw, gyroYRaw, gyroZRaw);

  if (runMode == RunMode::Calibrate) {
    if (calibrationSamples < 32767) {
      gyroXSum += gyroXRaw;
      gyroYSum += gyroYRaw;
      gyroZSum += gyroZRaw;
      accelSumMg += accelMagnitudeMg;
      ++calibrationSamples;
    }
    if (static_cast<int32_t>(nowMs - calibrationUntilMs) >= 0) {
      finishCalibration();
    }
    Imu::drainFifo();
    updateDisplayService();
    return;
  }

  const int16_t dynamicGyroXRaw = static_cast<int16_t>(gyroXRaw - gyroBaselineX);
  const int16_t dynamicGyroYRaw = static_cast<int16_t>(gyroYRaw - gyroBaselineY);
  const int16_t dynamicGyroZRaw = static_cast<int16_t>(gyroZRaw - gyroBaselineZ);
  const uint16_t gyroMagnitudeRaw =
      magnitudeRaw(dynamicGyroXRaw, dynamicGyroYRaw, dynamicGyroZRaw);
  latestGyroMagnitudeRaw = gyroMagnitudeRaw;

  const uint16_t dynamicAccelMg = absDiff16(accelMagnitudeMg, accelBaselineMg);
  if (dynamicAccelMg < kBaselineTrackDeltaMg) {
    const int32_t baselineDeltaMg =
        static_cast<int32_t>(accelMagnitudeMg) - static_cast<int32_t>(accelBaselineMg);
    accelBaselineMg = static_cast<uint16_t>(
        static_cast<int32_t>(accelBaselineMg) + (baselineDeltaMg >> 5));
  }

  const uint32_t strength =
      static_cast<uint32_t>(gyroMagnitudeRaw) +
      static_cast<uint32_t>(dynamicAccelMg) * 4UL;
  const uint16_t liftStrength = saturateToUint16(strength);

  if (runMode == RunMode::Monitor) {
    updateMotionCandidate(strength, nowMs);
    recordPreCaptureSample(nowMs, gyroMagnitudeRaw, dynamicAccelMg);

    if (isCaptureStartMotion(strength, gyroMagnitudeRaw, dynamicAccelMg)) {
      Imu::readTapEvent();
      lastActivityMs = nowMs;
      startCapture(nowMs, liftStrength, captureStartTimeFor(nowMs), true);
      updateCapturePeaks(
          gyroMagnitudeRaw,
          dynamicAccelMg,
          liftStrength,
          nowMs);
      Imu::drainFifo();
      updateDisplayService();
      return;
    }

    if (isIdleTimedOut(nowMs)) {
      enterFinalSleep();
    }
    Imu::drainFifo();
    updateDisplayService();
    return;
  }

  if (runMode != RunMode::Capturing) {
    Imu::drainFifo();
    updateDisplayService();
    return;
  }

  Imu::readTapEvent();

  const uint16_t strength16 = liftStrength;
  if (strength16 > capturePeakStrength) {
    if (static_cast<uint32_t>(strength16) >=
        static_cast<uint32_t>(capturePeakStrength) + kCaptureRestartStrength) {
      startCapture(nowMs, strength16, nowMs, true);
    } else {
      capturePeakStrength = strength16;
    }
  }
  updateCapturePeaks(
      gyroMagnitudeRaw,
      dynamicAccelMg,
      strength16,
      nowMs);

  if (isCaptureFinished(strength16, nowMs)) {
    finishCapture(nowMs);
  }
  Imu::drainFifo();
  updateDisplayService();
}
