import { Node } from "../capnp/schema.ts";

/**
 * An index over {@link Node}s.
 */
export class NodeIndex {
  private readonly nodes = new Map<bigint, Node>();

  public constructor(nodes: Iterable<Node>) {
    for (const node of nodes) {
      this.nodes.set(node.id, node);
    }
  }

  public nodeById(id: bigint): Node {
    const node = this.nodes.get(id);

    if (node === undefined) {
      throw new Error(`node with ID 0x${id.toString(16)} not found`);
    }

    return node;
  }
}

/**
 * An index over the parents of {@link Node}s.
 */
export class NodeParentIndex {
  public readonly nodes: NodeIndex;

  private readonly parentIds = new Map<bigint, bigint | undefined>();
  private fileIds?: Map<bigint, bigint | undefined>;

  public constructor(nodes: Iterable<Node>) {
    this.nodes = new NodeIndex(nodes);

    for (const node of nodes) {
      if (node.scopeId !== 0n) {
        this.parentIds.set(node.id, node.scopeId);
      }
    }
  }

  public getParentId(nodeId: bigint): bigint | undefined {
    return this.parentIds.get(nodeId);
  }

  public getParent(nodeId: bigint): Node | undefined {
    return this._toNode(this.getParentId(nodeId));
  }

  public getFileId(nodeId: bigint): bigint | undefined {
    if (this.fileIds !== undefined) {
      const cached = this.fileIds?.get(nodeId);

      if (cached !== undefined) {
        return cached;
      }
    } else {
      this.fileIds = new Map();
    }

    const parentId = this.parentIds.get(nodeId);
    const fileId = parentId === undefined
      ? undefined
      : this._toNode(parentId)?.which() === Node.FILE
      ? parentId
      : this.getFileId(parentId);

    this.fileIds.set(nodeId, fileId);

    return fileId;
  }

  public getFile(nodeId: bigint): Node | undefined {
    return this._toNode(this.getFileId(nodeId));
  }

  private _toNode(nodeId: bigint | undefined): Node | undefined {
    return nodeId === undefined ? undefined : this.nodes.nodeById(nodeId);
  }
}
