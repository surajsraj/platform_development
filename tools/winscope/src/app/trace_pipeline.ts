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

import {FileUtils} from 'common/file_utils';
import {
  TimestampConverter,
  UTC_TIMEZONE_INFO,
} from 'common/timestamp_converter';
import {Analytics} from 'logging/analytics';
import {ProgressListener} from 'messaging/progress_listener';
import {UserNotificationsListener} from 'messaging/user_notifications_listener';
import {CorruptedArchive, NoInputFiles} from 'messaging/user_warnings';
import {FileAndParsers} from 'parsers/file_and_parsers';
import {ParserFactory as LegacyParserFactory} from 'parsers/legacy/parser_factory';
import {TracesParserFactory} from 'parsers/legacy/traces_parser_factory';
import {ParserFactory as PerfettoParserFactory} from 'parsers/perfetto/parser_factory';
import {FrameMapper} from 'trace/frame_mapper';
import {Trace} from 'trace/trace';
import {Traces} from 'trace/traces';
import {TraceFile} from 'trace/trace_file';
import {TraceType, TraceTypeUtils} from 'trace/trace_type';
import {FilesSource} from './files_source';
import {LoadedParsers} from './loaded_parsers';
import {TraceFileFilter} from './trace_file_filter';

type UnzippedArchive = TraceFile[];

export class TracePipeline {
  private loadedParsers = new LoadedParsers();
  private traceFileFilter = new TraceFileFilter();
  private tracesParserFactory = new TracesParserFactory();
  private traces = new Traces();
  private downloadArchiveFilename?: string;
  private timestampConverter = new TimestampConverter(UTC_TIMEZONE_INFO);

  async loadFiles(
    files: File[],
    source: FilesSource,
    notificationListener: UserNotificationsListener,
    progressListener: ProgressListener | undefined,
  ) {
    this.downloadArchiveFilename = this.makeDownloadArchiveFilename(
      files,
      source,
    );

    try {
      const unzippedArchives = await this.unzipFiles(
        files,
        progressListener,
        notificationListener,
      );

      if (unzippedArchives.length === 0) {
        notificationListener.onNotifications([new NoInputFiles()]);
        return;
      }

      for (const unzippedArchive of unzippedArchives) {
        await this.loadUnzippedArchive(
          unzippedArchive,
          notificationListener,
          progressListener,
        );
      }

      this.traces = new Traces();

      this.loadedParsers.getParsers().forEach((parser) => {
        const trace = Trace.fromParser(parser);
        this.traces.addTrace(trace);
        Analytics.Tracing.logTraceLoaded(parser);
      });

      const tracesParsers = await this.tracesParserFactory.createParsers(
        this.traces,
        this.timestampConverter,
      );

      tracesParsers.forEach((tracesParser) => {
        const trace = Trace.fromParser(tracesParser);
        this.traces.addTrace(trace);
      });

      const hasTransitionTrace =
        this.traces.getTrace(TraceType.TRANSITION) !== undefined;
      if (hasTransitionTrace) {
        this.traces.deleteTracesByType(TraceType.WM_TRANSITION);
        this.traces.deleteTracesByType(TraceType.SHELL_TRANSITION);
      }

      const hasCujTrace = this.traces.getTrace(TraceType.CUJS);
      if (hasCujTrace) {
        this.traces.deleteTracesByType(TraceType.EVENT_LOG);
      }
    } finally {
      progressListener?.onOperationFinished();
    }
  }

  removeTrace(trace: Trace<object>) {
    this.loadedParsers.remove(trace.getParser());
    this.traces.deleteTrace(trace);
  }

  async makeZipArchiveWithLoadedTraceFiles(): Promise<Blob> {
    return this.loadedParsers.makeZipArchive();
  }

  filterTracesWithoutVisualization() {
    const tracesWithoutVisualization = this.traces
      .mapTrace((trace) => {
        if (!TraceTypeUtils.canVisualizeTrace(trace.type)) {
          return trace;
        }
        return undefined;
      })
      .filter((trace) => trace !== undefined) as Array<Trace<object>>;
    tracesWithoutVisualization.forEach((trace) =>
      this.traces.deleteTrace(trace),
    );
  }

  async buildTraces() {
    for (const trace of this.traces) {
      if (trace.lengthEntries === 0 || trace.isDumpWithoutTimestamp()) {
        continue;
      } else {
        const timestamp = trace.getEntry(0).getTimestamp();
        this.timestampConverter.initializeUTCOffset(timestamp);
        break;
      }
    }
    await new FrameMapper(this.traces).computeMapping();
  }

  getTraces(): Traces {
    return this.traces;
  }

  getDownloadArchiveFilename(): string {
    return this.downloadArchiveFilename ?? 'winscope';
  }

  getTimestampConverter(): TimestampConverter {
    return this.timestampConverter;
  }

  async getScreenRecordingVideo(): Promise<undefined | Blob> {
    const traces = this.getTraces();
    const screenRecording =
      traces.getTrace(TraceType.SCREEN_RECORDING) ??
      traces.getTrace(TraceType.SCREENSHOT);
    if (!screenRecording || screenRecording.lengthEntries === 0) {
      return undefined;
    }
    return (await screenRecording.getEntry(0).getValue()).videoData;
  }

  clear() {
    this.loadedParsers.clear();
    this.traces = new Traces();
    this.timestampConverter.clear();
    this.downloadArchiveFilename = undefined;
  }

  private async loadUnzippedArchive(
    unzippedArchive: UnzippedArchive,
    notificationListener: UserNotificationsListener,
    progressListener: ProgressListener | undefined,
  ) {
    const filterResult = await this.traceFileFilter.filter(
      unzippedArchive,
      notificationListener,
    );
    if (filterResult.timezoneInfo) {
      this.timestampConverter = new TimestampConverter(
        filterResult.timezoneInfo,
      );
    }

    if (!filterResult.perfetto && filterResult.legacy.length === 0) {
      notificationListener.onNotifications([new NoInputFiles()]);
      return;
    }

    const legacyParsers = await new LegacyParserFactory().createParsers(
      filterResult.legacy,
      this.timestampConverter,
      progressListener,
      notificationListener,
    );

    let perfettoParsers: FileAndParsers | undefined;

    if (filterResult.perfetto) {
      const parsers = await new PerfettoParserFactory().createParsers(
        filterResult.perfetto,
        this.timestampConverter,
        progressListener,
        notificationListener,
      );
      perfettoParsers = new FileAndParsers(filterResult.perfetto, parsers);
    }

    const monotonicTimeOffset =
      this.loadedParsers.getLatestRealToMonotonicOffset(
        legacyParsers
          .map((fileAndParser) => fileAndParser.parser)
          .concat(perfettoParsers?.parsers ?? []),
      );

    const realToBootTimeOffset =
      this.loadedParsers.getLatestRealToBootTimeOffset(
        legacyParsers
          .map((fileAndParser) => fileAndParser.parser)
          .concat(perfettoParsers?.parsers ?? []),
      );

    if (monotonicTimeOffset !== undefined) {
      this.timestampConverter.setRealToMonotonicTimeOffsetNs(
        monotonicTimeOffset,
      );
    }
    if (realToBootTimeOffset !== undefined) {
      this.timestampConverter.setRealToBootTimeOffsetNs(realToBootTimeOffset);
    }

    perfettoParsers?.parsers.forEach((p) => p.createTimestamps());
    legacyParsers.forEach((fileAndParser) =>
      fileAndParser.parser.createTimestamps(),
    );

    this.loadedParsers.addParsers(
      legacyParsers,
      perfettoParsers,
      notificationListener,
    );
  }

  private makeDownloadArchiveFilename(
    files: File[],
    source: FilesSource,
  ): string {
    // set download archive file name, used to download all traces
    let filenameWithCurrTime: string;
    const currTime = new Date().toISOString().slice(0, -5).replace('T', '_');
    if (!this.downloadArchiveFilename && files.length === 1) {
      const filenameNoDir = FileUtils.removeDirFromFileName(files[0].name);
      const filenameNoDirOrExt =
        FileUtils.removeExtensionFromFilename(filenameNoDir);
      filenameWithCurrTime = `${filenameNoDirOrExt}_${currTime}`;
    } else {
      filenameWithCurrTime = `${source}_${currTime}`;
    }

    const archiveFilenameNoIllegalChars = filenameWithCurrTime.replace(
      FileUtils.ILLEGAL_FILENAME_CHARACTERS_REGEX,
      '_',
    );
    if (FileUtils.DOWNLOAD_FILENAME_REGEX.test(archiveFilenameNoIllegalChars)) {
      return archiveFilenameNoIllegalChars;
    } else {
      console.error(
        "Cannot convert uploaded archive filename to acceptable format for download. Defaulting download filename to 'winscope.zip'.",
      );
      return 'winscope';
    }
  }

  private async unzipFiles(
    files: File[],
    progressListener: ProgressListener | undefined,
    notificationListener: UserNotificationsListener,
  ): Promise<UnzippedArchive[]> {
    const unzippedArchives: UnzippedArchive[] = [];
    const progressMessage = 'Unzipping files...';

    progressListener?.onProgressUpdate(progressMessage, 0);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      const onSubProgressUpdate = (subPercentage: number) => {
        const totalPercentage =
          (100 * i) / files.length + subPercentage / files.length;
        progressListener?.onProgressUpdate(progressMessage, totalPercentage);
      };

      if (await FileUtils.isZipFile(file)) {
        try {
          const subFiles = await FileUtils.unzipFile(file, onSubProgressUpdate);
          const subTraceFiles = subFiles.map((subFile) => {
            return new TraceFile(subFile, file);
          });
          unzippedArchives.push([...subTraceFiles]);
          onSubProgressUpdate(100);
        } catch (e) {
          notificationListener.onNotifications([new CorruptedArchive(file)]);
        }
      } else if (await FileUtils.isGZipFile(file)) {
        const unzippedFile = await FileUtils.decompressGZipFile(file);
        unzippedArchives.push([new TraceFile(unzippedFile, file)]);
        onSubProgressUpdate(100);
      } else {
        unzippedArchives.push([new TraceFile(file, undefined)]);
        onSubProgressUpdate(100);
      }
    }

    progressListener?.onProgressUpdate(progressMessage, 100);

    return unzippedArchives;
  }
}
