import type { Utility, UtilityContext } from './utilities.js';
import { str, text } from './utilities.js';
import { moo, errorCodes, type MooValue } from '../values/index.js';
import { truth, fold } from '../values/operations.js';
import { fail } from '../runtime/errors.js';
import type { Budget } from '../runtime/budget.js';
import { format } from '../values/format.js';

const p = (name: string, types: Utility['parameters'][number]['types'], optional = false) => ({name, types, optional, description: name + '.'});
export const codecs: Utility[] = [];
function add(name: string, parameters: Utility['parameters'], returns: Utility['returns'], summary: string, invoke: Utility['invoke'], toast = true, notes: string[] = [], rest?: Utility['rest']): void {
  codecs.push({name, parameters, returns, summary, invoke, notes, ...(toast ? {profiles: ['toaststunt'] as const as ['toaststunt']} : {}), ...(rest ? {rest} : {})});
}
/** Binary strings use printable ASCII and ~XX escapes, independently of UTF-8 text. */
export function binaryDecode(source: string, budget: Budget): number[] {
  budget.step(source.length); budget.allocate(source.length);
  const bytes: number[] = [];
  for (let i=0;i<source.length;i++) {
    const code=source.charCodeAt(i);
    if(code===126) { const hex=source.slice(i+1,i+3); if(!/^[0-9a-f]{2}$/i.test(hex))fail('E_INVARG'); bytes.push(parseInt(hex,16)); i+=2; }
    else { if(code>255)fail('E_INVARG','Binary strings require byte characters or ~XX escapes'); bytes.push(code); }
  }
  return bytes;
}
export function binaryEncode(bytes: readonly number[], budget: Budget): MooValue {
  let out='';
  for(const byte of bytes) { budget.step(); const s=byte>=32&&byte<=126&&byte!==126?String.fromCharCode(byte):'~'+byte.toString(16).toUpperCase().padStart(2,'0');budget.allocate(s.length);out+=s; }
  return moo.string(out);
}
function flatten(values: readonly MooValue[], budget: Budget): number[] {
  const out:number[]=[];
  function visit(v:MooValue):void {
    budget.enter();
    try { budget.step();
      if(v.type==='int') {if(v.value<0n||v.value>255n)fail('E_INVARG');budget.allocate(1);out.push(Number(v.value));}
      else if(v.type==='string') {budget.step(v.value.length);budget.allocate(v.value.length);for(let i=0;i<v.value.length;i++){const c=v.value.charCodeAt(i);if(c>255)fail('E_INVARG');out.push(c);}}
      else if(v.type==='list')v.value.forEach(visit);
      else fail('E_INVARG');
    } finally {budget.leave();}
  }
  values.forEach(visit);return out;
}
add('encode_binary',[],'string','Encode bytes, strings and nested lists as a MOO binary string.',(args,{budget})=>binaryEncode(flatten(args,budget),budget),false,[],p('values',['any']));
add('chr',[],'string','Build a string from bytes, strings and nested lists.',(args,{budget})=>{let out='';for(const c of flatten(args,budget))out+=String.fromCharCode(c);return text(out,budget);},true,['Educational runtime: accepts byte values 0–255 without wizard checks; strings use byte characters, not UTF-8.'],p('values',['any']));
add('decode_binary',[p('source',['string']),p('fully',['any'],true)],'list','Decode a MOO binary string into byte integers or mixed text and bytes.',([a,b],{budget})=>{
  const bytes=binaryDecode(str(a!),budget);budget.allocate(bytes.length);
  if(b&&truth(b))return moo.list(bytes.map(moo.int));
  const out:MooValue[]=[];let pending='';
  for(const c of bytes){if(c===9||c>=32&&c<=126)pending+=String.fromCharCode(c);else{if(pending)out.push(moo.string(pending));pending='';out.push(moo.int(c));}}
  if(pending)out.push(moo.string(pending));return moo.list(out);
},false);
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
add('encode_base64',[p('source',['string']),p('urlSafe',['any'],true)],'string','Encode a MOO binary string as Base64.',([a,b],{budget})=>{
  const bytes=binaryDecode(str(a!),budget);budget.allocate(Math.ceil(bytes.length/3)*4);let out='';
  for(let i=0;i<bytes.length;i+=3){budget.step();const x=bytes[i]!,y=bytes[i+1]??0,z=bytes[i+2]??0;out+=alphabet[x>>2]!+alphabet[((x&3)<<4)|(y>>4)]!+(i+1<bytes.length?alphabet[((y&15)<<2)|(z>>6)]:'=')+(i+2<bytes.length?alphabet[z&63]:'=');}
  if(b&&truth(b))out=out.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');return moo.string(out);
});
add('decode_base64',[p('source',['string']),p('urlSafe',['any'],true)],'string','Decode Base64 to a MOO binary string.',([a,b],{budget})=>{
  let source=str(a!);budget.step(source.length);const safe=b&&truth(b);
  if(!(safe?/^[A-Za-z0-9_-]*={0,2}$/:/^[A-Za-z0-9+/]*={0,2}$/).test(source))fail('E_INVARG');
  const unpadded=source.replace(/=+$/,'');if(unpadded.length%4===1||(!safe&&source.length%4!==0)||(source.includes('=')&&source.length%4!==0))fail('E_INVARG');
  source=unpadded.replace(/-/g,'+').replace(/_/g,'/');budget.allocate(Math.floor(source.length*3/4));const bytes:number[]=[];let acc=0,bits=0;
  for(const c of source){acc=(acc<<6)|alphabet.indexOf(c);bits+=6;if(bits>=8){bits-=8;bytes.push((acc>>bits)&255);}}
  return binaryEncode(bytes,budget);
});
add('url_encode',[p('source',['string'])],'string','Percent-encode UTF-8 text for a URL component.',([a],{budget})=>{
  const s=str(a!);budget.step(s.length);budget.allocate(s.length*12);try{return moo.string(encodeURIComponent(s).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase()));}catch{return fail('E_INVARG');}
},true,['Pure text operation; no network permission is needed. Uses UTF-8 rather than raw native string bytes.']);
add('url_decode',[p('source',['string'])],'string','Decode percent-encoded UTF-8 text; plus signs remain literal.',([a],{budget})=>{
  const s=str(a!);budget.step(s.length);budget.allocate(s.length);try{return moo.string(decodeURIComponent(s));}catch{return fail('E_INVARG');}
},true,['Malformed escapes and invalid UTF-8 raise E_INVARG.']);
add('strtr',[p('source',['string']),p('from',['string']),p('to',['string']),p('caseMatters',['any'],true)],'string','Translate characters, deleting those without a replacement.',([a,b,c,d],{budget})=>{
  const source=str(a!),from=str(b!),to=str(c!),table=new Map<string,string>();budget.step(source.length+from.length);budget.allocate(from.length*2+source.length);
  for(let i=0;i<from.length;i++){const ch=from[i]!,replacement=to[i]??'';if((!d||!truth(d))&&/^[a-z]$/i.test(ch)){table.set(ch.toUpperCase(),replacement.toUpperCase());table.set(ch.toLowerCase(),replacement.toLowerCase());}else table.set(ch,replacement);}
  let out='';for(const ch of source)out+=table.get(ch)??ch;return moo.string(out);
},true,['Case folding applies to ASCII letters; other Unicode characters are preserved.']);

function embeddedMode(value?:MooValue):boolean {const mode=value?fold(str(value)):'common-subset';if(mode!=='common-subset'&&mode!=='embedded-types')fail('E_INVARG');return mode==='embedded-types';}
const suffix=/\|(obj|int|float|err|str)$/;
function typedString(value:string,embedded:boolean):MooValue {
  const match=embedded?suffix.exec(value):null;if(!match)return moo.string(value);
  const body=value.slice(0,match.index);
  switch(match[1]){
    case 'str':return moo.string(body);
    case 'err':return moo.error(errorCodes.find(code=>code===body)??'E_NONE');
    case 'float':{const n=parseFloat(body);if(!Number.isFinite(n))fail('E_INVARG');return moo.float(n);}
    default:{const n=/^[+-]?\d+/.exec(body.replace(/^#/,''));const i=BigInt.asIntN(64,n?BigInt(n[0]):0n);return match[1]==='obj'?moo.object(i):moo.int(i);}
  }
}
function parseJson(source:string,embedded:boolean,{budget}:UtilityContext):MooValue {
  budget.step(source.length);budget.allocate(source.length);let at=0;
  const space=()=>{while(/[\t\n\r ]/.test(source[at]??'!'))at++;};
  function string():string {const start=at++;while(at<source.length){const c=source[at++];if(c==='"'){try{return JSON.parse(source.slice(start,at)) as string;}catch{fail('E_INVARG');}}if(c==='\\')at++;}return fail('E_INVARG');}
  function value():MooValue {
    budget.enter();try{budget.step();space();const c=source[at];
      if(c==='"')return typedString(string(),embedded);
      if(c==='['||c==='{') {
        const map=c==='{',close=map?'}':']';at++;space();const values:MooValue[]=[],pairs:[MooValue,MooValue][]=[];
        if(source[at]!==close)while(true){space();let key:MooValue|undefined;
          if(map){if(source[at]!=='"')fail('E_INVARG');key=typedString(string(),embedded);space();if(source[at++]!==':')fail('E_INVARG');}
          const v=value();budget.allocate(1);if(key)pairs.push([key,v]);else values.push(v);space();if(source[at]!==',')break;at++;
        }
        if(source[at++]!==close)fail('E_INVARG');return map?moo.map(pairs):moo.list(values);
      }
      for(const [token,v] of [['true',moo.int(1)],['false',moo.int(0)],['null',moo.error('E_NONE')]] as const){if(source.startsWith(token,at)){at+=token.length;return v;}}
      const token=/-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;token.lastIndex=at;const m=token.exec(source);if(!m)fail('E_INVARG');at+=m[0].length;
      if(!/[.eE]/.test(m[0])){const n=BigInt(m[0]);if(BigInt.asIntN(64,n)===n)return moo.int(n);}
      const n=Number(m[0]);if(!Number.isFinite(n))fail('E_INVARG');return moo.float(n);
    }finally{budget.leave();}
  }
  const result=value();space();if(at!==source.length)fail('E_INVARG');return result;
}
add('parse_json',[p('source',['string']),p('mode',['string'],true)],'any','Parse JSON into MOO values, preserving 64-bit integers.',([a,b],context)=>parseJson(str(a!),embeddedMode(b),context),true,['Limited: JSON booleans become integer 1/0 because this runtime has no distinct boolean value type; null becomes E_NONE. Supports common-subset and embedded-types modes. JSON comments are rejected.']);
add('generate_json',[p('value',['any']),p('mode',['string'],true),p('disableBinaryEscapes',['any'],true)],'string','Generate JSON using common-subset or embedded-types encoding.',([a,b,c],{budget,profile})=>{
  const embedded=embeddedMode(b);if(c&&truth(c))fail('E_INVARG','Disabling binary escapes is not supported');
  function quoted(s:string):string {budget.allocate(s.length*6+2);return JSON.stringify(s);}
  function scalar(v:MooValue,key=false):string {
    if(v.type==='string')return quoted(v.value+(embedded&&suffix.test(v.value)?'|str':''));
    const s=v.type==='float' ? (Number.isInteger(v.value)&&!v.value.toString().includes('e') ? v.value.toString()+'.0' : v.value.toString()) : format(v,true,budget);
    if(!key&&(v.type==='int'||v.type==='float')){budget.allocate(s.length);return s;}
    return quoted(s+(embedded?'|'+({object:'obj',error:'err',int:'int',float:'float'} as Record<string,string>)[v.type]:''));
  }
  function generate(v:MooValue):string {budget.enter();try{budget.step();if(v.type==='list'){budget.allocate(v.value.length+2);return '['+v.value.map(generate).join(',')+']';}if(v.type==='map'){budget.allocate(v.value.length*2+2);return '{'+v.value.map(([k,v])=>scalar(k,true)+':'+generate(v)).join(',')+'}';}return scalar(v);}finally{budget.leave();}}
  return moo.string(generate(a!));
},true,['No distinct boolean type: integers generate JSON numbers. The optional disableBinaryEscapes flag must be false. Unicode strings use standard JSON escaping.']);
const ansi:Record<string,string>={red:'31',green:'32',yellow:'33',blue:'34',purple:'35',cyan:'36',normal:'0',inverse:'7',underline:'4',bold:'1',bright:'1',unbold:'22',blink:'5',unblink:'25',magenta:'35',unbright:'22',white:'37',gray:'1;30',grey:'1;30',black:'30','b:black':'40','b:red':'41','b:green':'42','b:yellow':'43','b:blue':'44','b:magenta':'45','b:purple':'45','b:cyan':'46','b:white':'47'};
for(const name of ['parse_ansi','remove_ansi'])add(name,[p('source',['string'])],'string',name==='parse_ansi'?'Expand color tags into ANSI control codes.':'Remove recognized color tags from text.',([a],{budget})=>{
 const s=str(a!);budget.step(s.length);budget.allocate(s.length*2);
 return moo.string(s.replace(/\[([a-z:]+)\]/gi,(whole:string,tag:string)=>{
  const key=fold(tag);if(!Object.hasOwn(ansi,key)&&!['random','null','beep'].includes(key))return whole;
  if(name==='remove_ansi'||key==='null')return '';if(key==='beep')return '\x07';
  return '\x1b['+(key==='random'?String(31+Math.floor(Math.random()*6)):ansi[key])+'m';
 }));
},true,[name==='remove_ansi'?'Removes bracket tags such as [red], not existing escape sequences.':'[random] uses a non-cryptographic random color.']);
