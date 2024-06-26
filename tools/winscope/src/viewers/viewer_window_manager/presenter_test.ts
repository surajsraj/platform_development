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
 * WITHOUT WARRANTIES OR CONDITIONS OF ANYf KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {RealTimestamp} from 'common/time';
import {WindowManagerState} from 'flickerlib/common';
import {TracePositionUpdate} from 'messaging/winscope_event';
import {HierarchyTreeBuilder} from 'test/unit/hierarchy_tree_builder';
import {MockStorage} from 'test/unit/mock_storage';
import {TraceBuilder} from 'test/unit/trace_builder';
import {UnitTestUtils} from 'test/unit/utils';
import {Trace} from 'trace/trace';
import {Traces} from 'trace/traces';
import {TraceType} from 'trace/trace_type';
import {VISIBLE_CHIP} from 'viewers/common/chip';
import {HierarchyTreeNode, PropertiesTreeNode} from 'viewers/common/ui_tree_utils';
import {UserOptions} from 'viewers/common/user_options';
import {Presenter} from './presenter';
import {UiData} from './ui_data';

describe('PresenterWindowManager', () => {
  let trace: Trace<WindowManagerState>;
  let positionUpdate: TracePositionUpdate;
  let presenter: Presenter;
  let uiData: UiData;
  let selectedTree: HierarchyTreeNode;

  beforeAll(async () => {
    trace = new TraceBuilder<WindowManagerState>()
      .setEntries([await UnitTestUtils.getWindowManagerState()])
      .build();

    positionUpdate = TracePositionUpdate.fromTraceEntry(trace.getEntry(0));

    selectedTree = new HierarchyTreeBuilder()
      .setName('ScreenDecorOverlayBottom')
      .setStableId('WindowContainer 2088ac1 ScreenDecorOverlayBottom')
      .setKind('WindowState')
      .setSimplifyNames(true)
      .setShortName('ScreenDecorOverlayBottom')
      .setLayerId(61)
      .setFilteredView(true)
      .setIsVisible(true)
      .setChips([VISIBLE_CHIP])
      .build();
  });

  beforeEach(() => {
    presenter = createPresenter(trace);
  });

  it('is robust to empty trace', async () => {
    const emptyTrace = new TraceBuilder<WindowManagerState>().setEntries([]).build();
    const presenter = createPresenter(emptyTrace);
    expect(uiData.hierarchyUserOptions).toBeTruthy();
    expect(uiData.tree).toBeFalsy();

    const positionUpdateWithoutTraceEntry = TracePositionUpdate.fromTimestamp(
      new RealTimestamp(0n)
    );
    await presenter.onAppEvent(positionUpdateWithoutTraceEntry);
    expect(uiData.hierarchyUserOptions).toBeTruthy();
    expect(uiData.tree).toBeFalsy();
  });

  it('processes trace position update', async () => {
    await presenter.onAppEvent(positionUpdate);
    const filteredUiDataRectLabels = uiData.rects
      ?.filter((rect) => rect.isVisible !== undefined)
      .map((rect) => rect.label);
    const hierarchyOpts = uiData.hierarchyUserOptions
      ? Object.keys(uiData.hierarchyUserOptions)
      : null;
    const propertyOpts = uiData.propertiesUserOptions
      ? Object.keys(uiData.propertiesUserOptions)
      : null;
    expect(uiData.highlightedItem?.length).toEqual(0);
    expect(filteredUiDataRectLabels?.length).toEqual(14);
    expect(uiData.displayIds).toContain(0);
    expect(hierarchyOpts).toBeTruthy();
    expect(propertyOpts).toBeTruthy();

    // does not check specific tree values as tree generation method may change
    expect(Object.keys(uiData.tree!).length > 0).toBeTrue();
  });

  it('disables show diff and generates non-diff tree if no prev entry available', async () => {
    await presenter.onAppEvent(positionUpdate);

    const hierarchyOpts = uiData.hierarchyUserOptions ?? null;
    expect(hierarchyOpts).toBeTruthy();
    expect(hierarchyOpts!['showDiff'].isUnavailable).toBeTrue();

    const propertyOpts = uiData.propertiesUserOptions ?? null;
    expect(propertyOpts).toBeTruthy();
    expect(propertyOpts!['showDiff'].isUnavailable).toBeTrue();

    expect(Object.keys(uiData.tree!).length > 0).toBeTrue();
  });

  it('creates input data for rects view', async () => {
    await presenter.onAppEvent(positionUpdate);
    expect(uiData.rects.length).toBeGreaterThan(0);
    expect(uiData.rects[0].x).toEqual(0);
    expect(uiData.rects[0].y).toEqual(2326);
    expect(uiData.rects[0].w).toEqual(1080);
    expect(uiData.rects[0].h).toEqual(74);
  });

  it('updates pinned items', async () => {
    await presenter.onAppEvent(positionUpdate);
    expect(uiData.pinnedItems).toEqual([]);

    const pinnedItem = new HierarchyTreeBuilder()
      .setName('FirstPinnedItem')
      .setStableId('TestItem 4')
      .setLayerId(4)
      .build();

    presenter.updatePinnedItems(pinnedItem);
    expect(uiData.pinnedItems).toContain(pinnedItem);
  });

  it('updates highlighted item', () => {
    expect(uiData.highlightedItem).toEqual('');
    const id = '4';
    presenter.updateHighlightedItem(id);
    expect(uiData.highlightedItem).toBe(id);
  });

  it('updates highlighted property', () => {
    expect(uiData.highlightedProperty).toEqual('');
    const id = '4';
    presenter.updateHighlightedProperty(id);
    expect(uiData.highlightedProperty).toBe(id);
  });

  it('updates hierarchy tree', async () => {
    //change flat view to true
    const userOptions: UserOptions = {
      showDiff: {
        name: 'Show diff',
        enabled: false,
      },
      simplifyNames: {
        name: 'Simplify names',
        enabled: true,
      },
      onlyVisible: {
        name: 'Only visible',
        enabled: false,
      },
      flat: {
        name: 'Flat',
        enabled: true,
      },
    };

    await presenter.onAppEvent(positionUpdate);
    expect(uiData.tree?.children.length).toEqual(1);
    presenter.updateHierarchyTree(userOptions);
    expect(uiData.hierarchyUserOptions).toEqual(userOptions);
    // nested children should now be on same level initial parent
    expect(uiData.tree?.children.length).toEqual(72);
  });

  it('filters hierarchy tree', async () => {
    const userOptions: UserOptions = {
      showDiff: {
        name: 'Show diff',
        enabled: false,
      },
      simplifyNames: {
        name: 'Simplify names',
        enabled: true,
      },
      onlyVisible: {
        name: 'Only visible',
        enabled: false,
      },
      flat: {
        name: 'Flat',
        enabled: true,
      },
    };
    await presenter.onAppEvent(positionUpdate);
    presenter.updateHierarchyTree(userOptions);
    expect(uiData.tree?.children.length).toEqual(72);
    presenter.filterHierarchyTree('ScreenDecor');
    // All but two window states should be filtered out
    expect(uiData.tree?.children.length).toEqual(2);
  });

  it('sets properties tree and associated ui data', async () => {
    await presenter.onAppEvent(positionUpdate);
    presenter.newPropertiesTree(selectedTree);
    // does not check specific tree values as tree transformation method may change
    expect(uiData.propertiesTree).toBeTruthy();
  });

  it('updates properties tree', async () => {
    //change flat view to true
    const userOptions: UserOptions = {
      showDiff: {
        name: 'Show diff',
        enabled: true,
      },
      showDefaults: {
        name: 'Show defaults',
        enabled: true,
        tooltip: `
                  If checked, shows the value of all properties.
                  Otherwise, hides all properties whose value is
                  the default for its data type.
                `,
      },
    };

    await presenter.onAppEvent(positionUpdate);
    presenter.newPropertiesTree(selectedTree);
    expect(uiData.propertiesTree?.diffType).toBeFalsy();
    presenter.updatePropertiesTree(userOptions);
    expect(uiData.propertiesUserOptions).toEqual(userOptions);
    //check that diff type added
    expect(uiData.propertiesTree?.diffType).toBeTruthy();
  });

  it('filters properties tree', async () => {
    await presenter.onAppEvent(positionUpdate);
    presenter.newPropertiesTree(selectedTree);

    let nonTerminalChildren =
      uiData.propertiesTree?.children?.filter(
        (child: PropertiesTreeNode) => typeof child.propertyKey === 'string'
      ) ?? [];

    expect(nonTerminalChildren.length).toEqual(16);
    presenter.filterPropertiesTree('visible');

    nonTerminalChildren =
      uiData.propertiesTree?.children?.filter(
        (child: PropertiesTreeNode) => typeof child.propertyKey === 'string'
      ) ?? [];
    expect(nonTerminalChildren.length).toEqual(1);
  });

  const createPresenter = (trace: Trace<WindowManagerState>): Presenter => {
    const traces = new Traces();
    traces.setTrace(TraceType.WINDOW_MANAGER, trace);
    return new Presenter(traces, new MockStorage(), (newData: UiData) => {
      uiData = newData;
    });
  };
});
