import type { Utility } from './utilities.js';
import { str,int,lst,text } from './utilities.js';
import { moo,type MooValue } from '../values/index.js';
import { truth } from '../values/operations.js';
import { fail,MooError,LimitError } from '../runtime/errors.js';
import type { Execution } from '../runtime/execution.js';
import { initialEnvironment } from '../host/environment.js';
import { sqliteEngine } from '../host/sqlite.js';
const p=(name:string,type:Utility['returns'],optional=false)=>({name,types:[type],optional,description:name+'.'}),h=()=>p('handle','int');
const specs:[string,Utility['parameters'],Utility['returns']][]=[
 ['sqlite_open',[p('path','string'),p('options','int',true)],'int'],['sqlite_close',[h()],'int'],['sqlite_handles',[],'list'],['sqlite_info',[h()],'map'],['sqlite_query',[h(),p('sql','string'),p('headers','any',true)],'any'],['sqlite_execute',[h(),p('sql','string'),p('parameters','list')],'any'],['sqlite_last_insert_row_id',[h()],'int'],['sqlite_limit',[h(),p('category','any'),p('value','int')],'int'],['sqlite_interrupt',[h()],'int'],
];
export const sqliteBuiltins:Omit<Utility,'invoke'>[]=specs.map(([name,parameters,returns])=>({name,parameters,returns,profiles:['toaststunt'],summary:'SQLite: '+name.slice(7).replaceAll('_',' ')+'.',notes:[
 'Real SQLite via sql.js, with databases and handles saved inside the virtual world. No host files. A bounded single-table SQL subset supports SELECT, CREATE/DROP TABLE, INSERT VALUES, UPDATE and DELETE; no joins, subqueries, triggers, views, extensions or transactions.',
 'Limits: 16 database pages, 1000 rows per database, 100 columns, 10000 SQL characters, 32 expression levels. Supported scalar/aggregate functions: abs, length, lower, upper, coalesce, ifnull, nullif, min, max, sum, count, avg, total, round. Other constructs raise E_INVARG. SQL engine errors return strings.',
 'Options bits: 1 parses values, 2 parses #objects, 4 changes newlines to tabs; default 3. NULL becomes "NULL". Only LIMIT_LENGTH, LIMIT_SQL_LENGTH and LIMIT_COLUMN are configurable, within the fixed caps. sqlite_interrupt is a validated no-op between synchronous statements; worker Stop remains available.',
]}));
function safeSql(sql:string):string {
 const clean=sql.replace(/'(?:[^']|'')*'/g,"''");if(/['"`\[\]]/.test(clean.replaceAll("''",''))||/--|\/\*/.test(clean))fail('E_INVARG','Unsupported SQL quoting or comments');
 const command=/^\s*(SELECT|CREATE\s+TABLE|INSERT\s+INTO|UPDATE|DELETE\s+FROM|DROP\s+TABLE)\b/i.exec(clean)?.[1]?.toUpperCase();if(!command)fail('E_INVARG','Unsupported SQL statement');
 if(clean.replace(/;\s*$/,'').includes(';')||/\b(JOIN|WITH|UNION|INTERSECT|EXCEPT|ATTACH|PRAGMA|TRIGGER|VIEW|VIRTUAL|REFERENCES|CHECK|GENERATED|LIKE|GLOB|AS\s+SELECT)\b/i.test(clean))fail('E_INVARG','Unsupported SQL feature');
 if((clean.match(/\bSELECT\b/gi)?.length??0)>(command==='SELECT'?1:0))fail('E_INVARG','SQL subqueries are unsupported');
 if(command.startsWith('INSERT')&&!/\bVALUES\b/i.test(clean))fail('E_INVARG');
 if((clean.match(/\bFROM\b/gi)?.length??0)>1||/\bFROM\b/i.test(clean)&&! /\bFROM\s+[a-z_]\w*(?:\s+AS\s+[a-z_]\w*)?\s*(?:WHERE\b|ORDER\b|GROUP\b|LIMIT\b|;?\s*$)/i.test(clean))fail('E_INVARG','Only one unaliased table is supported');
 let depth=0;for(const char of clean){if(char==='('&&++depth>32)fail('E_INVARG');if(char===')')depth--;}
 const table=/^\s*(?:CREATE\s+TABLE|INSERT\s+INTO)\s+([a-z_]\w*)/i.exec(clean)?.[1]?.toLowerCase();
 for(const match of clean.matchAll(/([a-z_]\w*)\s*\(/gi))if(match[1]!.toLowerCase()!==table&&!['values','varchar','char','decimal','numeric','abs','length','lower','upper','coalesce','ifnull','nullif','min','max','sum','count','avg','total','round','in'].includes(match[1]!.toLowerCase()))fail('E_INVARG','Unsupported SQL function');
 return command;
}
function encodeBytes(bytes:Uint8Array):string {let result='';for(const b of bytes)result+=String.fromCharCode(b);return btoa(result);}
export function invokeSqliteBuiltin(name:string,args:MooValue[],execution:Execution):MooValue {
 const {world,budget}=execution,original=world.environment??initialEnvironment(),size=JSON.stringify(original).length;budget.step(size);budget.allocate(size);const state=structuredClone(original);state.databases??=[];
 const a=args[0]!,b=args[1],c=args[2],commit=(v:MooValue=moo.int(0))=>{state.time++;world.setEnvironment(state,budget);return v;};
 if(name==='sqlite_handles'){budget.allocate(state.databases.length);return moo.list(state.databases.filter(d=>d.open).map(d=>moo.int(d.id)));}
 if(name==='sqlite_open'){
  const path=str(a),options=b?Number(int(b)):3;if(!Number.isSafeInteger(options)||options<0||options>7)fail('E_INVARG');
  if(state.databases.filter(d=>d.open).length>=16)fail('E_QUOTA');let database=path&&path!==':memory:'?state.databases.find(d=>d.path===path):undefined;
  if(database?.open)fail('E_INVARG','Database is already open');if(database){database.open=true;database.options=options;database.lastRowId='0';}
  else{database={id:Math.max(0,...state.databases.map(d=>d.id))+1,path,data:'',options,lastRowId:'0',open:true,limits:[100000,10000,100]};state.databases.push(database);}
  return commit(moo.int(database.id));
 }
 const id=int(a),database=state.databases.find(d=>BigInt(d.id)===id&&d.open);if(!database)fail('E_INVARG');
 if(name==='sqlite_close'){database.open=false;if(database.path===''||database.path===':memory:')state.databases=state.databases.filter(d=>d!==database);return commit();}
 if(name==='sqlite_info'){budget.allocate(10);return moo.map([['path',moo.string(database.path)],['parse_types',moo.int(database.options&1?1:0)],['parse_objects',moo.int(database.options&2?1:0)],['sanitize_strings',moo.int(database.options&4?1:0)],['locks',moo.int(0)]].map(([k,v])=>[moo.string(k as string),v as MooValue]));}
 if(name==='sqlite_last_insert_row_id')return moo.int(BigInt(database.lastRowId));
 if(name==='sqlite_interrupt')return moo.int(0);
 if(name==='sqlite_limit'){const category=b!.type==='int'?Number(int(b!)):['LIMIT_LENGTH','LIMIT_SQL_LENGTH','LIMIT_COLUMN'].indexOf(str(b!));if(category<0||category>2)fail('E_INVARG');const previous=database.limits[category]!,limit=int(c!);if(limit>=0n){database.limits[category]=Number(limit>BigInt([100000,10000,100][category]!)?BigInt([100000,10000,100][category]!):limit);return commit(moo.int(previous));}return moo.int(previous);}
 const sql=str(b!);if(sql.length>database.limits[1]!)fail('E_QUOTA');budget.step(sql.length+2000);const command=safeSql(sql),engine=sqliteEngine();
 const bytes=Uint8Array.from(atob(database.data),c=>c.charCodeAt(0));budget.allocate(bytes.length);
 let db:InstanceType<typeof engine.Database>|undefined;
 try{
  db=new engine.Database(bytes.length?bytes:undefined);db.run('PRAGMA max_page_count=16');
  const schema=db.exec('SELECT type,sql FROM sqlite_master');for(const result of schema)for(const row of result.values){if(row[0]!=='table'&&row[0]!=='index')fail('E_INVARG','Unsupported stored SQL schema');if(row[1]&&row[0]==='table')safeSql(String(row[1]));}
  const parameters=name==='sqlite_execute'?lst(c!).map(v=>{if(v.type==='string'){budget.step(v.value.length);budget.allocate(v.value.length);if(v.value.length>database.limits[0]!)fail('E_QUOTA');return v.value;}if(v.type==='object')return '#'+v.value;if(v.type==='float')return v.value;if(v.type==='int'){if(v.value>BigInt(Number.MAX_SAFE_INTEGER)||v.value<BigInt(Number.MIN_SAFE_INTEGER))fail('E_INVARG','Large integer parameters must be passed in SQL text');return Number(v.value);}return fail('E_TYPE');}):undefined;
  const stmt=db.prepare(sql);const result:MooValue[]=[];
  try{
   if(parameters)stmt.bind(parameters);const names=stmt.getColumnNames();if(names.length>database.limits[2]!)fail('E_QUOTA');
   while(stmt.step()){budget.step(100);if(result.length>=1000)fail('E_QUOTA');const values=stmt.get(null,{useBigInt:true});budget.allocate(values.length*3);
    const row=values.map((v,i)=>{
     let s=v===null?'NULL':v instanceof Uint8Array?String.fromCharCode(...v):String(v);if(s.length>database.limits[0]!)fail('E_QUOTA');if(database.options&4)s=s.replaceAll('\n','\t');budget.allocate(s.length);let value:MooValue=moo.string(s);
     if(database.options&1){if(database.options&2&&/^#-?\d+$/.test(s))value=moo.object(BigInt.asIntN(64,BigInt(s.slice(1))));else if(/^-?\d+$/.test(s))value=moo.int(BigInt.asIntN(64,BigInt(s)));else if(/^-?(?:\d+\.\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(s)&&Number.isFinite(Number(s)))value=moo.float(Number(s));}
     return name==='sqlite_query'&&c&&truth(c)?moo.list([moo.string(names[i]!),value]):value;
    });result.push(moo.list(row));
   }
  }finally{stmt.free();}
  if(command!=='SELECT'){
   const tables=db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");let rows=0;for(const result of tables)for(const [name] of result.values){if(typeof name!=='string'||!/^\w+$/.test(name))fail('E_INVARG');if((db.exec('PRAGMA table_info("'+name+'")')[0]?.values.length??0)>database.limits[2]!)fail('E_QUOTA');rows+=Number(db.exec('SELECT count(*) FROM "'+name+'"')[0]!.values[0]![0]);}if(rows>1000)fail('E_QUOTA');
   if(command.startsWith('INSERT')){const rowStatement=db.prepare('SELECT last_insert_rowid()');try{rowStatement.step();database.lastRowId=String(rowStatement.get(undefined,{useBigInt:true})[0]);}finally{rowStatement.free();}}const output=db.export();budget.allocate(output.length*2);database.data=encodeBytes(output);return commit(moo.list(result));
  }
  return moo.list(result);
 }catch(error){if(error instanceof MooError||error instanceof LimitError)throw error;return text(error instanceof Error?error.message:'SQLite error',budget);}finally{db?.close();}
}
