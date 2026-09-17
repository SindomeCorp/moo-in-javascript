import initSql from 'sql.js/dist/sql-asm.js';
import type { SqlJsStatic } from 'sql.js';
let engine:SqlJsStatic|undefined;
let loading:Promise<void>|undefined;
export function initializeSqlite():Promise<void> {
 return loading??= (async()=>{
  // Node can also import our browser bundle; keep its CJS loader out of browsers.
  if(typeof process!=='undefined'&&process.versions?.node){const {createRequire}=await import('node:module');const init=createRequire(import.meta.url)('sql.js/dist/sql-asm.js') as typeof initSql;engine=await init();}
  else engine=await initSql();
 })();
}
export function sqliteEngine():SqlJsStatic {if(!engine)throw new Error('SQLite was not initialized');return engine;}
