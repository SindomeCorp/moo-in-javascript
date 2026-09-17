declare module 'unix-crypt-td-js' {
  export default function unixCrypt(password: string | number[], salt: string): string;
}
// sql.js's published @types package injects a global EmscriptenModule that
// conflicts with web-tree-sitter. Keep this small boundary local to our adapter.
declare module 'sql.js' {
  export type SqlValue = number | bigint | string | Uint8Array | null;
  export interface Statement {
    bind(values: (number | string | Uint8Array | null)[]): boolean;
    step(): boolean;
    get(values?: null, options?: { useBigInt: boolean }): SqlValue[];
    getColumnNames(): string[];
    free(): void;
  }
  export interface Database {
    run(sql: string): void;
    exec(sql: string): { columns: string[]; values: SqlValue[][] }[];
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
  }
  export interface SqlJsStatic { Database: new (data?: Uint8Array) => Database }
  export default function initialize(): Promise<SqlJsStatic>;
}
declare module 'sql.js/dist/sql-asm.js' {
  import initialize from 'sql.js';
  export default initialize;
}
