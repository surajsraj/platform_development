/*
 * Copyright 2020, The Android Open Source Project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {Task, toRect, WindowContainer} from '../common';
import {shortenName} from '../mixin';

Task.fromProto = (windowContainer: WindowContainer, proto: any): Task => {
  const entry = new Task(
    proto.taskFragment?.activityType ?? proto.activityType,
    proto.fillsParent,
    toRect(proto.bounds),
    proto.id,
    proto.rootTaskId,
    proto.taskFragment?.displayId,
    toRect(proto.lastNonFullscreenBounds),
    proto.realActivity,
    proto.origActivity,
    proto.resizeMode,
    proto.resumedActivity?.title ?? '',
    proto.animatingBounds,
    proto.surfaceWidth,
    proto.surfaceHeight,
    proto.createdByOrganizer,
    proto.taskFragment?.minWidth ?? proto.minWidth,
    proto.taskFragment?.minHeight ?? proto.minHeight,
    windowContainer
  );

  addAttributes(entry, proto);
  return entry;
};

function addAttributes(entry: Task, proto: any) {
  entry.proto = proto;
  entry.proto.configurationContainer = proto.windowContainer?.configurationContainer;
  entry.proto.surfaceControl = proto.windowContainer?.surfaceControl;
  entry.kind = entry.constructor.name;
  entry.shortName = shortenName(entry.name);
}

export {Task};
