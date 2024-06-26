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

interface TreeUtilsNode {
  name: string;
  parent?: TreeUtilsNode;
  children?: TreeUtilsNode[];
}

type FilterType = (node: TreeUtilsNode | undefined | null) => boolean;

class TreeUtils {
  static findDescendantNode(
    node: TreeUtilsNode,
    isTargetNode: FilterType
  ): TreeUtilsNode | undefined {
    if (isTargetNode(node)) {
      return node;
    }

    if (!node.children) {
      return;
    }

    for (const child of node.children) {
      const target = TreeUtils.findDescendantNode(child, isTargetNode);
      if (target) {
        return target;
      }
    }

    return undefined;
  }

  static findAncestorNode(
    node: TreeUtilsNode,
    isTargetNode: FilterType
  ): TreeUtilsNode | undefined {
    let ancestor = node.parent;

    while (ancestor && !isTargetNode(ancestor)) {
      ancestor = ancestor.parent;
    }

    return ancestor;
  }

  static makeNodeFilter(filterString: string): FilterType {
    const filter = (item: TreeUtilsNode | undefined | null) => {
      if (item) {
        const regex = new RegExp(filterString, 'i');
        return filterString.length === 0 || regex.test(`${item.name}`);
      }
      return false;
    };
    return filter;
  }
}

export {TreeUtilsNode, TreeUtils, FilterType};
