import { RE2JS } from 're2js';
import type { Utility } from './utilities.js';
import { str, lst, int } from './utilities.js';
import { moo, type MooValue } from '../values/index.js';
import { truth } from '../values/operations.js';
import { fail } from '../runtime/errors.js';
import type { Budget } from '../runtime/budget.js';

const p=(name:string,types:Utility['parameters'][number]['types'],optional=false)=>({name,types,optional,description:name+'.'});
export const regexBuiltins:Utility[]=[];
const notes=['Limited: uses RE2 syntax and matching for the supported subset. Backreferences, lookarounds and other unsupported constructs raise E_INVARG. Case-insensitive matching uses RE2 Unicode folding. Counted repetition is not supported. Work is charged against execution budgets.'];
function compile(pattern:string,sensitive:boolean,budget:Budget):RE2JS {
  budget.step(pattern.length);budget.allocate(pattern.length*16);
  // Bound compile-time recursion and counted-repeat expansion before entering the engine.
  if(pattern.length>4096||/\{\d/.test(pattern))fail('E_INVARG','Counted repetition is not supported; use *, + or ?');
  let depth=0;for(const c of pattern){if(c==='('&&++depth>64)fail('E_INVARG','Pattern nesting limit');if(c===')')depth--;}
  try {return RE2JS.compile(pattern,sensitive?0:RE2JS.CASE_INSENSITIVE);}catch{return fail('E_INVARG','Invalid or unsupported regular expression');}
}
function mooPattern(pattern:string):string {
  let out='';
  for(let i=0;i<pattern.length;i++) {
    const c=pattern[i]!;
    if(c==='%') {const next=pattern[++i];if(!next)fail('E_INVARG');
      if('()|'.includes(next))out+=next;
      else if('bBwW'.includes(next))out+='\\'+next;
      else if(/[1-9<>]/.test(next))fail('E_INVARG','Backreferences and directional word boundaries are unsupported');
      else out+=/[.*+?[^$\\{}\]]/.test(next)?'\\'+next:next;
    } else if(c==='['){let end=i+1;if(pattern[end]==='^')end++;if(pattern[end]===']')end++;
      while(end<pattern.length&&pattern[end]!==']')end++;if(end===pattern.length)fail('E_INVARG');
      out+=pattern.slice(i,end+1).replace(/\\/g,'\\\\');i=end;
    } else out+='()|{}\\'.includes(c)?'\\'+c:c;
  }
  return out;
}
function charge(regex:RE2JS,subject:string,budget:Budget):void {budget.step((subject.length+1)*Math.max(1,regex.programSize()));}
for(const name of ['match','rmatch'])regexBuiltins.push({name,parameters:[p('subject',['string']),p('pattern',['string']),p('caseMatters',['any'],true)],returns:'list',summary:'Find the '+(name==='match'?'first':'rightmost')+' MOO pattern match.',notes:[...notes,'MOO percent escapes are translated; indices count UTF-16 units.'],invoke:([a,b,c],{budget})=>{
  const subject=str(a!),sensitive=!!c&&truth(c),regex=compile(mooPattern(str(b!)),sensitive,budget),matcher=regex.matcher(subject);let result:MooValue=moo.list([]),offset=0;
  do {charge(regex,subject,budget);if(!matcher.find(offset))break;
    budget.allocate(32);
    const pairs=Array.from({length:9},(_,i)=>moo.list([moo.int(i<matcher.groupCount()?matcher.start(i+1)+1:0),moo.int(i<matcher.groupCount()?matcher.end(i+1):-1)]));
    result=moo.list([moo.int(matcher.start()+1),moo.int(matcher.end()),moo.list(pairs),a!]);
    offset=matcher.start()+1;
  }while(name==='rmatch'&&offset<=subject.length);
  return result;
}});
regexBuiltins.push({name:'substitute',parameters:[p('template',['string']),p('match',['list'])],returns:'string',summary:'Expand %0–%9 captures and %% using a match() result.',notes:[],invoke:([a,b],{budget})=>{
  const template=str(a!),match=lst(b!);if(match.length!==4||match[0]!.type!=='int'||match[1]!.type!=='int'||match[2]!.type!=='list'||match[2]!.value.length!==9||match[3]!.type!=='string')fail('E_INVARG');
  const subject=match[3]!.value,pairs=[moo.list(match.slice(0,2)),...match[2]!.value];
  for(const pair of pairs){if(pair.type!=='list'||pair.value.length!==2||pair.value.some(v=>v.type!=='int'))fail('E_INVARG');const start=int(pair.value[0]!),end=int(pair.value[1]!);if(!((start===0n&&end===-1n)||(start>0n&&end>=start-1n&&end<=BigInt(subject.length))))fail('E_INVARG');}
  let out='';budget.step(template.length);
  for(let i=0;i<template.length;i++){let piece=template[i]!;if(piece==='%'){const next=template[++i];if(next==='%')piece='%';else if(next&&/^[0-9]$/.test(next)){const pair=lst(pairs[Number(next)]!),start=Number(int(pair[0]!)),end=Number(int(pair[1]!));piece=start===0?'':subject.slice(start-1,end);}else fail('E_INVARG');}budget.allocate(piece.length);out+=piece;}
  return moo.string(out);
}});
regexBuiltins.push({name:'pcre_match',profiles:['toaststunt'],parameters:[p('subject',['string']),p('pattern',['string']),p('caseMatters',['int'],true),p('all',['int'],true)],returns:'list',summary:'Return capture maps for matching substrings.',notes,invoke:([a,b,c,d],{budget})=>{
 const subject=str(a!),pattern=str(b!);if(!pattern)fail('E_INVARG');if(c)int(c);if(d)int(d);const sensitive=!!c&&truth(c),regex=compile(pattern,sensitive,budget),matcher=regex.matcher(subject);
 const names=new Map(Object.entries(regex.namedGroups()).map(([key,value])=>[value,key]));const result:MooValue[]=[];
 while(true){charge(regex,subject,budget);if(!matcher.find())break;const pairs:[MooValue,MooValue][]=[];
  for(let i=0;i<=matcher.groupCount();i++){const start=matcher.start(i),end=matcher.end(i);if(start<0)continue;budget.allocate(8+end-start);pairs.push([moo.string(names.get(i)??String(i)),moo.map([[moo.string('match'),moo.string(subject.slice(start,end))],[moo.string('position'),moo.list([moo.int(start+1),moo.int(end)])]])]);}
  result.push(moo.map(pairs));if(d&&!truth(d))break;
 }
 return moo.list(result);
}});
regexBuiltins.push({name:'pcre_replace',profiles:['toaststunt'],parameters:[p('subject',['string']),p('command',['string'])],returns:'string',summary:'Replace text using an s/pattern/replacement/flags command.',notes:[...notes,'Supports flags g, i, m and s, and $0–$9 or $& replacement captures. Output control characters become spaces.'],invoke:([a,b],{budget})=>{
 const subject=str(a!),command=str(b!);if(command[0]!=='s'||!command[1]||/[\w\s\\]/.test(command[1]!))fail('E_INVARG');const delimiter=command[1]!;
 const parts:string[]=[];let part='',at=2;
 for(;at<command.length;at++){const c=command[at]!;if(c==='\\'&&command[at+1]===delimiter){part+=delimiter;at++;}else if(c===delimiter){parts.push(part);part='';if(parts.length===2){at++;break;}}else part+=c;}
 const flags=command.slice(at);if(parts.length!==2||/[^gims]/.test(flags))fail('E_INVARG');
 let pattern=parts[0]!;if(flags.includes('m'))pattern='(?m)'+pattern;if(flags.includes('s'))pattern='(?s)'+pattern;
 const sensitive=!flags.includes('i'),regex=compile(pattern,sensitive,budget),matcher=regex.matcher(subject);let out='',offset=0;
 const append=(s:string)=>{budget.allocate(s.length);out+=s;};
 while(true){charge(regex,subject,budget);if(!matcher.find())break;append(subject.slice(offset,matcher.start()));const replacement=parts[1]!;
  for(let i=0;i<replacement.length;i++){const c=replacement[i]!;if(c==='$'&&replacement[i+1]&&/[0-9&]/.test(replacement[i+1]!)){const key=replacement[++i]!,group=key==='&'?0:Number(key);if(group>matcher.groupCount())fail('E_INVARG');append(matcher.start(group)<0?'':subject.slice(matcher.start(group),matcher.end(group)));}else if(c==='\\'&&replacement[i+1])append(replacement[++i]!);else append(c);}
  offset=matcher.end();if(!flags.includes('g'))break;
 }
 append(subject.slice(offset));return moo.string(out.replace(/[\x00-\x1f\x7f]/g,' '));
}});
