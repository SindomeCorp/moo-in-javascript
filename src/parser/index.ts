import { Parser, Language, type Node } from 'web-tree-sitter';
import type { Diagnostic, SourceSpan, SyntaxNode } from '../ast/source.js';

export type Profile = 'lambdamoo' | 'toaststunt';
export interface ParserOptions {
  profile: Profile;
  grammarWasm?: string | Uint8Array;
  runtimeWasm?: string;
}
export type ParseResult =
  | { readonly ok: true; readonly profile: Profile; readonly syntax: SyntaxNode }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

export class HostError extends Error {
  override readonly name = 'HostError';
}

export function assertProfile(value: unknown): asserts value is Profile {
  if (value !== 'lambdamoo' && value !== 'toaststunt') {
    throw new HostError('An explicit profile is required: lambdamoo or toaststunt');
  }
}

let initialization: Promise<void> | undefined;
let initializedRuntime: string | undefined;

function span(node: Node): SourceSpan {
  return {
    start: { offset: node.startIndex, ...node.startPosition },
    end: { offset: node.endIndex, ...node.endPosition },
  };
}

/** Parser initialization is shared by web-tree-sitter in each JS realm. */
export async function createParser(options: ParserOptions): Promise<MooParser> {
  assertProfile(options?.profile);
  const runtime = options.runtimeWasm ?? new URL('../../assets/tree-sitter.wasm', import.meta.url).href;
  if (initialization && runtime !== initializedRuntime) {
    throw new HostError('Runtime WASM URL must be the same for all parsers in one realm');
  }
  if (!initialization) {
    initializedRuntime = runtime;
    // Node's Emscripten loader expects a filesystem path for file URLs.
    const location = runtime.startsWith('file:') ? decodeURIComponent(new URL(runtime).pathname) : runtime;
    initialization = Parser.init({ locateFile: () => location }).catch(cause => {
      initialization = undefined;
      initializedRuntime = undefined;
      throw new HostError('Unable to initialize parser runtime', { cause });
    });
  }
  await initialization;
  try {
    const asset = options.grammarWasm ?? new URL('../../assets/tree-sitter-moo.wasm', import.meta.url).href;
    const location = typeof asset === 'string' && asset.startsWith('file:')
      ? decodeURIComponent(new URL(asset).pathname) : asset;
    const language = await Language.load(location);
    const parser = new Parser();
    parser.setLanguage(language);
    return new MooParser(options.profile, parser);
  } catch (cause) {
    throw new HostError('Unable to load MOO grammar', { cause });
  }
}

export class MooParser {
  #parser: Parser | undefined;
  constructor(readonly profile: Profile, parser: Parser) { this.#parser = parser; }

  parse(source: string): ParseResult {
    if (!this.#parser) throw new HostError('Parser has been disposed');
    if (typeof source !== 'string') throw new HostError('Source must be a string');
    if (source.length > 1_000_000) throw new HostError('Source exceeds 1,000,000 UTF-16 code units');
    const tree = this.#parser.parse(source);
    if (!tree) throw new HostError('Parser did not produce a tree');
    const diagnostics: Diagnostic[] = [];
    try {
      // Traverse iteratively: deeply nested input must not overflow the host stack.
      const pending: Node[] = [tree.rootNode];
      while (pending.length) {
        const node = pending.pop()!;
        if (node.isError || node.isMissing || node.type === 'unterminated_string') {
          diagnostics.push({ category: 'syntax-error', message: node.isMissing
            ? `Missing ${node.type}` : `Invalid syntax: ${node.type}`, span: span(node) });
        }
        if (node.type === 'fork_statement' || (this.profile === 'lambdamoo' && node.type === 'map_literal')) {
          diagnostics.push({ category: 'unsupported-feature', message: `${node.type} is unsupported in ${this.profile}`, span: span(node) });
        }
        for (let i = node.childCount - 1; i >= 0; i--) pending.push(node.child(i)!);
      }
      if (diagnostics.length) return { ok: false, diagnostics };
      const copies = new Map<number, SyntaxNode>();
      const stack: { node: Node; visited: boolean; field: string | null }[] = [{ node: tree.rootNode, visited: false, field: null }];
      while (stack.length) {
        const item = stack.pop()!;
        const { node, field } = item;
        if (!item.visited) {
          stack.push({ ...item, visited: true });
          for (let i = node.childCount - 1; i >= 0; i--) {
            stack.push({ node: node.child(i)!, field: node.fieldNameForChild(i), visited: false });
          }
        } else {
          copies.set(node.id, { kind: node.type, text: node.childCount ? '' : node.text,
            named: node.isNamed, field, span: span(node), children: node.children.map(child => copies.get(child!.id)!) });
        }
      }
      return { ok: true, profile: this.profile, syntax: copies.get(tree.rootNode.id)! };
    } finally { tree.delete(); }
  }

  dispose(): void { this.#parser?.delete(); this.#parser = undefined; }
}
