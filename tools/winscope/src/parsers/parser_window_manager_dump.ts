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

import {Timestamp, TimestampType} from 'common/time';
import {WindowManagerState} from 'flickerlib/windows/WindowManagerState';
import {
  CustomQueryParserResultTypeMap,
  CustomQueryType,
  VisitableParserCustomQuery,
} from 'trace/custom_query';
import {EntriesRange} from 'trace/index_types';
import {TraceFile} from 'trace/trace_file';
import {TraceType} from 'trace/trace_type';
import {AbstractParser} from './abstract_parser';
import {ParserWindowManagerUtils} from './parser_window_manager_utils';
import {WindowManagerServiceDumpProto} from './proto_types';

class ParserWindowManagerDump extends AbstractParser {
  constructor(trace: TraceFile) {
    super(trace);
  }

  override getTraceType(): TraceType {
    return TraceType.WINDOW_MANAGER;
  }

  override getMagicNumber(): undefined {
    return undefined;
  }

  override decodeTrace(buffer: Uint8Array): any[] {
    const entryProto = WindowManagerServiceDumpProto.decode(buffer);

    // This parser is prone to accepting invalid inputs because it lacks a magic
    // number. Let's reduce the chances of accepting invalid inputs by making
    // sure that a trace entry can actually be created from the decoded proto.
    // If the trace entry creation fails, an exception is thrown and the parser
    // will be considered unsuited for this input data.
    this.processDecodedEntry(0, TimestampType.ELAPSED /*irrelevant for dump*/, entryProto);

    return [entryProto];
  }

  override getTimestamp(type: TimestampType, entryProto: any): undefined | Timestamp {
    if (type === TimestampType.ELAPSED) {
      return new Timestamp(TimestampType.ELAPSED, 0n);
    } else if (type === TimestampType.REAL) {
      return new Timestamp(TimestampType.REAL, 0n);
    }
    return undefined;
  }

  override processDecodedEntry(
    index: number,
    timestampType: TimestampType,
    entryProto: any
  ): WindowManagerState {
    return WindowManagerState.fromProto(entryProto);
  }

  override customQuery<Q extends CustomQueryType>(
    type: Q,
    entriesRange: EntriesRange
  ): Promise<CustomQueryParserResultTypeMap[Q]> {
    return new VisitableParserCustomQuery(type)
      .visit(CustomQueryType.WM_WINDOWS_TOKEN_AND_TITLE, () => {
        const result: CustomQueryParserResultTypeMap[CustomQueryType.WM_WINDOWS_TOKEN_AND_TITLE] =
          [];
        this.decodedEntries
          .slice(entriesRange.start, entriesRange.end)
          .forEach((windowManagerServiceDumpProto) => {
            ParserWindowManagerUtils.parseWindowsTokenAndTitle(
              windowManagerServiceDumpProto?.rootWindowContainer,
              result
            );
          });
        return Promise.resolve(result);
      })
      .getResult();
  }
}

export {ParserWindowManagerDump};
