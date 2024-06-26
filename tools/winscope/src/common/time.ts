/*
 * Copyright (C) 2022 The Android Open Source Project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export interface TimeRange {
  from: Timestamp;
  to: Timestamp;
}

export enum TimestampType {
  ELAPSED = 'ELAPSED',
  REAL = 'REAL',
}

export class Timestamp {
  private readonly type: TimestampType;
  private readonly valueNs: bigint;

  constructor(type: TimestampType, valueNs: bigint) {
    this.type = type;
    this.valueNs = valueNs;
  }

  static from(
    timestampType: TimestampType,
    elapsedTimestamp: bigint,
    realToElapsedTimeOffsetNs: bigint | undefined = undefined
  ) {
    switch (timestampType) {
      case TimestampType.REAL:
        if (realToElapsedTimeOffsetNs === undefined) {
          throw new Error("realToElapsedTimeOffsetNs can't be undefined to use real timestamp");
        }
        return new Timestamp(TimestampType.REAL, elapsedTimestamp + realToElapsedTimeOffsetNs);
      case TimestampType.ELAPSED:
        return new Timestamp(TimestampType.ELAPSED, elapsedTimestamp);
      default:
        throw new Error('Unhandled timestamp type');
    }
  }

  getType(): TimestampType {
    return this.type;
  }

  getValueNs(): bigint {
    return this.valueNs;
  }

  valueOf(): bigint {
    return this.getValueNs();
  }

  in(range: TimeRange): boolean {
    if (range.from.type !== this.type || range.to.type !== this.type) {
      throw new Error('Mismatching timestamp types');
    }

    return (
      range.from.getValueNs() <= this.getValueNs() && this.getValueNs() <= range.to.getValueNs()
    );
  }

  add(nanoseconds: bigint): Timestamp {
    return new Timestamp(this.type, this.valueNs + nanoseconds);
  }

  plus(timestamp: Timestamp): Timestamp {
    this.validateTimestampArithmetic(timestamp);
    return new Timestamp(this.type, timestamp.getValueNs() + this.getValueNs());
  }

  minus(timestamp: Timestamp): Timestamp {
    this.validateTimestampArithmetic(timestamp);
    return new Timestamp(this.type, this.getValueNs() - timestamp.getValueNs());
  }

  times(n: bigint): Timestamp {
    return new Timestamp(this.type, this.getValueNs() * n);
  }

  div(n: bigint): Timestamp {
    return new Timestamp(this.type, this.getValueNs() / n);
  }

  private validateTimestampArithmetic(timestamp: Timestamp) {
    if (timestamp.type !== this.type) {
      throw new Error('Attemping to do timestamp arithmetic on different timestamp types');
    }
  }
}

export class RealTimestamp extends Timestamp {
  constructor(valueNs: bigint) {
    super(TimestampType.REAL, valueNs);
  }
}

export class ElapsedTimestamp extends Timestamp {
  constructor(valueNs: bigint) {
    super(TimestampType.ELAPSED, valueNs);
  }
}
