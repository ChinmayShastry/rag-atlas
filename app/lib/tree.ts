import { cosine } from "./vector";

/**
 * Runtime side of RAPTOR. The tree is built offline by scripts/build-tree.mjs:
 * leaves are spans of the source documents, and each level above summarises a
 * cluster of the level below.
 *
 * The interesting result from the paper is that searching every level at once
 * beats walking down from the root — so both are offered here, and the
 * comparison is the point of the stage.
 */

export interface TreeNode {
  id: string;
  level: number;
  title: string;
  text: string;
  docs: string[];
  children: string[];
  span?: { docId: string; start: number; end: number };
}

export interface SummaryTree {
  meta: {
    chatModel: string;
    embedModel: string;
    builtAt: string;
    leafTarget: number;
    levels: number;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  };
  nodes: TreeNode[];
}

export interface ScoredNode {
  node: TreeNode;
  score: number;
  /** Set when the node was reached by descending rather than by flat search. */
  viaParent?: string;
}

export function nodesByLevel(tree: SummaryTree): TreeNode[][] {
  const levels: TreeNode[][] = [];
  for (const node of tree.nodes) {
    (levels[node.level] ??= []).push(node);
  }
  return levels;
}

export function treeIndex(tree: SummaryTree): Map<string, TreeNode> {
  return new Map(tree.nodes.map((n) => [n.id, n]));
}

/**
 * Collapsed-tree retrieval: every node at every level competes on equal terms.
 * A precise question naturally matches a leaf, a broad one a summary, without
 * anyone having to decide in advance which is wanted.
 */
export function collapsedSearch(
  tree: SummaryTree,
  vectors: Map<string, number[]>,
  query: number[],
  k: number,
): ScoredNode[] {
  return tree.nodes
    .map((node) => {
      const v = vectors.get(node.id);
      return { node, score: v ? cosine(query, v) : -1 };
    })
    .filter((s) => s.score > -1)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/**
 * Tree traversal: keep the best few nodes at the top level, descend into their
 * children, repeat. Cheaper, and structurally unable to recover from a wrong
 * turn near the root — whole branches become unreachable.
 */
export function traversalSearch(
  tree: SummaryTree,
  vectors: Map<string, number[]>,
  query: number[],
  keepPerLevel: number,
): { levels: ScoredNode[][]; selected: ScoredNode[] } {
  const index = treeIndex(tree);
  const byLevel = nodesByLevel(tree);
  const topLevel = byLevel.length - 1;
  const levels: ScoredNode[][] = [];

  const score = (node: TreeNode, viaParent?: string): ScoredNode => {
    const v = vectors.get(node.id);
    return { node, score: v ? cosine(query, v) : -1, viaParent };
  };

  let frontier: ScoredNode[] = (byLevel[topLevel] ?? [])
    .map((n) => score(n))
    .sort((a, b) => b.score - a.score)
    .slice(0, keepPerLevel);
  levels.push(frontier);

  for (let level = topLevel - 1; level >= 0; level--) {
    const candidates: ScoredNode[] = [];
    for (const parent of frontier) {
      for (const childId of parent.node.children) {
        const child = index.get(childId);
        if (child) candidates.push(score(child, parent.node.id));
      }
    }
    frontier = candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, keepPerLevel);
    levels.push(frontier);
  }

  return { levels, selected: levels[levels.length - 1] ?? [] };
}

export const LEVEL_COLORS = ["#C2603A", "#B0811C", "#5F7A4F", "#B0455A"];

export function levelLabel(level: number, total: number): string {
  if (level === 0) return "Leaf · source text";
  if (level === total - 1) return "Root · whole corpus";
  return `Level ${level} · summary`;
}
