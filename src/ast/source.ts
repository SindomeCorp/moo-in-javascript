/** Positions use zero-based UTF-16 offsets/columns and zero-based rows. End is exclusive. */
export interface Position { readonly offset: number; readonly row: number; readonly column: number }
export interface SourceSpan { readonly start: Position; readonly end: Position }
export interface Diagnostic {
  readonly category: 'syntax-error' | 'unsupported-feature';
  readonly message: string;
  readonly span: SourceSpan;
}
/** Owned syntax data: no live WASM nodes or parser resources escape parsing. */
export interface SyntaxNode {
  readonly kind: string;
  readonly text: string;
  readonly named: boolean;
  readonly field: string | null;
  readonly span: SourceSpan;
  readonly children: readonly SyntaxNode[];
}
