import { simplexNoise } from './simplex-noise.js';
import type { BuiltinParameter, BuiltinValueType } from './catalog.js';
import type { Profile } from '../parser/index.js';
import type { Budget } from '../runtime/budget.js';
import { fail } from '../runtime/errors.js';
import { moo, errorCodes, type MooValue } from '../values/index.js';
import { wrap, fold, equal, truth, compare, index } from '../values/operations.js';
export interface UtilityContext { profile: Profile; budget: Budget }
export interface Utility {
  name: string; parameters: BuiltinParameter[]; returns: BuiltinValueType;
  summary: string; notes: string[]; rest?: BuiltinParameter; profiles?: Profile[];
  invoke: (args: MooValue[], context: UtilityContext) => MooValue;
}
const p = (name: string, types: BuiltinValueType | BuiltinValueType[], optional = false): BuiltinParameter =>
  ({ name, types: Array.isArray(types) ? types : [types], description: name + '.', optional });
const number = ['int','float'] as BuiltinValueType[];
export const utilities: Utility[] = [];
function add(name: string, parameters: BuiltinParameter[], returns: BuiltinValueType, summary: string,
  invoke: Utility['invoke'], toast = false, notes: string[] = [], rest?: BuiltinParameter): void {
  utilities.push({ name, parameters, returns, summary, invoke, notes, ...(toast ? { profiles: ['toaststunt'] as Profile[] } : {}), ...(rest ? { rest } : {}) });
}
export function str(v: MooValue): string { if (v.type !== 'string') fail('E_TYPE'); return v.value; }
export function int(v: MooValue): bigint { if (v.type !== 'int') fail('E_TYPE'); return v.value; }
export function flt(v: MooValue): number { if (v.type !== 'float') fail('E_TYPE'); return v.value; }
export function lst(v: MooValue): readonly MooValue[] { if (v.type !== 'list') fail('E_TYPE'); return v.value; }
export function numeric(v: MooValue): number { if (v.type !== 'int' && v.type !== 'float') fail('E_TYPE'); return Number(v.value); }
export function finite(n: number): MooValue { if (Number.isNaN(n)) fail('E_INVARG'); if (!Number.isFinite(n)) fail('E_FLOAT'); return moo.float(n); }
export function text(s: string, budget: Budget): MooValue { budget.allocate(s.length); return moo.string(s); }
function numericValue(v: MooValue, profile: Profile, object = false): MooValue {
  let n: bigint;
  switch (v.type) {
    case 'int': case 'object': n = v.value; break;
    case 'error': n = BigInt(errorCodes.indexOf(v.value)); break;
    case 'float': n = BigInt(Math.trunc(v.value)); break;
    case 'string': {
      const s = object ? v.value.replace(/^ *#/, '') : v.value;
      const integer = /^\s*[+-]?\d+ *$/.test(s);
      if (integer) n = BigInt(s.trim());
      else if (!object && /^\s*[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)? *$/i.test(s)) {
        const f = Number(s); if (!Number.isFinite(f)) fail('E_FLOAT'); n = BigInt(Math.trunc(f));
      } else n = 0n;
      break;
    }
    default: return fail('E_TYPE');
  }
  const wrapped = BigInt.asIntN(profile === 'lambdamoo' ? 32 : 64, n);
  return object ? moo.object(wrapped) : moo.int(wrapped);
}
add('toint',[p('value','any')],'int','Convert a scalar to an integer; malformed numeric strings become 0.',([v],{profile})=>numericValue(v!,profile),false,['Out-of-range integer conversion follows the profile’s two’s-complement wrap policy.']);
const toint = utilities.at(-1)!;
utilities.push({...toint,name:'tonum',summary:'LambdaMOO alias for toint.',profiles:['lambdamoo']});
add('toobj',[p('value','any')],'object','Convert a scalar to an object reference, without checking existence.',([v],{profile})=>numericValue(v!,profile,true));
add('tofloat',[p('value','any')],'float','Convert a scalar to a float.',([v],{profile})=>{
  if(v!.type==='string') {
    if(!/^\s*[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)? *$/i.test(v!.value)){if(profile==='lambdamoo')return moo.float(0);fail('E_INVARG');}
    const n=Number(v!.value);if(!Number.isFinite(n))fail('E_INVARG');return moo.float(n);
  }
  if(v!.type==='error')return moo.float(errorCodes.indexOf(v!.value));
  if(v!.type==='object')return finite(Number(v!.value));
  return finite(numeric(v!));
});
for(const name of ['min','max'])add(name,[p('first',number)],'any',`Return the ${name==='min'?'smallest':'largest'} numeric argument.`,(args,{budget})=>{
  let best=args[0]!;numeric(best);
  for(const v of args.slice(1)){budget.step();if(v.type!==best.type)fail('E_TYPE');if(name==='min'?v.value<best.value:v.value>best.value)best=v;}
  return best;
},false,['All arguments must have the same numeric type.'],p('values',number));
add('abs',[p('value',number)],'any','Return numeric absolute value.',([v],{profile})=>v!.type==='int'?wrap(v!.value<0n?-v!.value:v!.value,profile):finite(Math.abs(flt(v!))));
const math: Record<string,(v:number)=>number>={sqrt:Math.sqrt,cbrt:Math.cbrt,sin:Math.sin,cos:Math.cos,tan:Math.tan,asin:Math.asin,acos:Math.acos,sinh:Math.sinh,cosh:Math.cosh,tanh:Math.tanh,acosh:Math.acosh,atanh:Math.atanh,asinh:Math.asinh,exp:Math.exp,log:Math.log,log10:Math.log10,ceil:Math.ceil,floor:Math.floor,trunc:Math.trunc,round:v=>Math.sign(v)*Math.round(Math.abs(v))};
for(const [name,fn] of Object.entries(math))add(name,[p('value','float')],'float',`Compute ${name} of a float.`,([v])=>finite(fn(flt(v!))),['cbrt','acosh','atanh','asinh','round'].includes(name),['Uses JavaScript IEEE-754 math; native libm rounding may differ.']);
add('atan',[p('value','float'),p('denominator','float',true)],'float','Compute arctangent, or two-argument arctangent.',([a,b])=>finite(b?Math.atan2(flt(a!),flt(b)):Math.atan(flt(a!))));
add('atan2',[p('y','float'),p('x','float')],'float','Compute two-argument arctangent.',([a,b])=>finite(Math.atan2(flt(a!),flt(b!))),true);
add('floatstr',[p('value','float'),p('precision','int'),p('scientific','any',true)],'string','Format a float with decimal precision.',([a,b,c],{budget})=>{
  const n=flt(a!),precision=int(b!);if(precision<0n)fail('E_INVARG');const digits=Number(precision>20n?20n:precision);
  let out=c&&truth(c)?n.toExponential(digits):n.toFixed(digits);
  out=out.replace(/e([+-])(\d)$/, 'e$10$2');return text(out,budget);
},false,['Precision is capped at 20 digits. Very large fixed-format values use JavaScript formatting; libc rounding may differ.']);
add('distance',[p('from','list'),p('to','list')],'float','Compute Euclidean distance between coordinates.',([a,b],{budget})=>{
  const x=lst(a!),y=lst(b!);if(x.length!==y.length)fail('E_INVARG');budget.step(x.length);
  let sum=0;for(let i=0;i<x.length;i++){const d=numeric(y[i]!)-numeric(x[i]!);sum+=d*d;}return finite(Math.sqrt(sum));
},true);
add('relative_heading',[p('from','list'),p('to','list')],'list','Return horizontal and vertical bearings in integer degrees.',([a,b],{budget})=>{
  const x=lst(a!),y=lst(b!);if(x.length!==3||y.length!==3)fail('E_INVARG');
  const [dx,dy,dz]=x.map((v,i)=>flt(y[i]!)-flt(v)) as [number,number,number];
  let angle=Math.atan2(dy,dx)*57.2957795130823;if(angle<0)angle+=360;budget.allocate(2);
  return moo.list([moo.int(Math.trunc(angle)),moo.int(Math.trunc(Math.atan2(dz,Math.sqrt(dx*dx+dy*dy))*57.2957795130823))]);
},true);
for(const name of ['listappend','listinsert','listdelete','listset','setadd','setremove']) {
  const params=name==='listdelete'?[p('list','list'),p('index','int')]:[p('list','list'),p('value','any'),...(['setadd','setremove'].includes(name)?[]:[p('index','int',name!=='listset')])];
  add(name,params,'list',`Return a new list after ${name}.`,([a,b,c],{budget})=>{
    const values=lst(a!);budget.allocate(values.length+1);budget.step(values.length);const out=[...values];
    if(name==='setadd'||name==='setremove') {
      const at=values.findIndex(v=>equal(v,b!,budget));if(name==='setadd'&&at<0)out.push(b!);if(name==='setremove'&&at>=0)out.splice(at,1);
    } else if(name==='listdelete'||name==='listset') {
      const at=int(name==='listdelete'?b!:c!);if(at<1n||at>BigInt(out.length))fail('E_RANGE');
      if(name==='listdelete')out.splice(Number(at)-1,1);else out[Number(at)-1]=b!;
    } else {
      let at=c?int(c)+(name==='listappend'?0n:-1n):BigInt(name==='listappend'?out.length:0);
      if(at<0n)at=0n;if(at>BigInt(out.length))at=BigInt(out.length);out.splice(Number(at),0,b!);
    }
    return moo.list(out);
  });
}
add('is_member',[p('value','any'),p('collection',['list','map']),p('caseMatters','int',true)],'int','Find the first matching value, using case-sensitive comparison by default.',([a,b,c],{profile,budget})=>{
  if(b!.type!=='list'&&(profile!=='toaststunt'||b!.type!=='map'))fail('E_INVARG');if(c)int(c);
  const values=b!.type==='list'?b!.value:b!.value.map(pair=>pair[1]);
  return moo.int(values.findIndex(v=>equal(a!,v,budget,c?truth(c):true))+1);
});
add('all_members',[p('value','any'),p('list','list')],'list','Return all one-based matching indices, ignoring ASCII case.',([a,b],{budget})=>{
  const out:MooValue[]=[];lst(b!).forEach((v,i)=>{if(equal(a!,v,budget)){budget.allocate(1);out.push(moo.int(i+1));}});return moo.list(out);
},true);
add('strcmp',[p('left','string'),p('right','string')],'int','Compare strings case-sensitively: -1, 0 or 1.',([a,b],{budget})=>{
  const x=str(a!),y=str(b!);budget.step(x.length+y.length);return moo.int(x<y?-1:x>y?1:0);
});
add('strsub',[p('source','string'),p('find','string'),p('replacement','string'),p('caseMatters','any',true)],'string','Replace nonoverlapping substring occurrences.',([a,b,c,d],{budget})=>{
  const source=str(a!),needle=str(b!),replacement=str(c!);if(!needle.length)fail('E_INVARG');
  const hay=d&&truth(d)?source:fold(source),find=d&&truth(d)?needle:fold(needle);budget.step(source.length+needle.length);
  let out='',at=0;
  while(at<source.length){budget.step();const next=hay.indexOf(find,at);if(next<0){budget.allocate(source.length-at);out+=source.slice(at);break;}
    budget.allocate(next-at+replacement.length);out+=source.slice(at,next)+replacement;at=next+needle.length;
  }return moo.string(out);
});
add('explode',[p('source','string'),p('delimiter','string',true),p('keepEmpty','int',true)],'list','Split on the first delimiter character (space by default).',([a,b,c],{budget})=>{
  const source=str(a!),delimiter=b?str(b)[0]??' ':' ';if(c)int(c);budget.step(source.length);budget.allocate(source.length+1);
  const parts=source.split(delimiter);return moo.list((c&&truth(c)?parts:parts.filter(Boolean)).map(moo.string));
},true);
add('reverse',[p('sequence',['list','string'])],'any','Reverse a list or string.',([a],{budget})=>{
  if(a!.type!=='list'&&a!.type!=='string')fail('E_INVARG');budget.allocate(a!.value.length);budget.step(a!.value.length);
  return a!.type==='list'?moo.list([...a!.value].reverse()):moo.string(a!.value.split('').reverse().join(''));
},true);
add('slice',[p('rows','list'),p('selector',['int','list','string'],true),p('missingValue','any',true)],'list','Extract selected columns or map values from a list.',([a,b,c],{budget})=>{
  const rows=lst(a!),selector=b??moo.int(1);budget.allocate(rows.length);const out:MooValue[]=[];
  if(!['int','list','string'].includes(selector.type))fail('E_INVARG');
  if(selector.type==='list'&&(!selector.value.length||selector.value.some(v=>v.type!=='int'||v.value<=0n)))fail(selector.value.some(v=>v.type!=='int')?'E_INVARG':'E_RANGE');
  if(selector.type==='int'&&selector.value<=0n)fail('E_RANGE');
  for(const row of rows){budget.step();
    if(selector.type==='string') {
      if(row.type!=='map')fail('E_INVARG');const found=row.value.find(([key])=>equal(key,selector,budget));if(found)out.push(found[1]);else if(c)out.push(c);
    } else {
      if(row.type!=='list'&&row.type!=='string')fail('E_INVARG');
      if(selector.type==='list'){budget.allocate(selector.value.length);out.push(moo.list(selector.value.map(key=>index(row,key,budget))));}
      else out.push(index(row,selector,budget));
    }
  }return moo.list(out);
},true);
add('sort',[p('values','list'),p('keys','list',true),p('natural','int',true),p('reverse','int',true)],'list','Sort a homogeneous scalar list, optionally by separate keys.',([a,b,c,d],{budget})=>{
  const values=lst(a!),provided=b?lst(b):[],keys=provided.length?provided:values;if(keys.length!==values.length)fail('E_INVARG');
  if(c)int(c);if(d)int(d);
  const type=keys[0]?.type;if(keys.some(v=>v.type!==type||v.type==='list'||v.type==='map'))fail('E_TYPE');
  budget.allocate(values.length);const indices=keys.map((_,i)=>i);indices.sort((i,j)=>c&&truth(c)&&keys[i]!.type==='string'?naturalCompare(str(keys[i]!),str(keys[j]!),budget):compare(keys[i]!,keys[j]!,budget));if(d&&truth(d))indices.reverse();return moo.list(indices.map(i=>values[i]!));
},true,['Natural sorting compares digit runs numerically, preserving lexical ordering for leading-zero runs. Equal keys retain input order before optional reversal.']);

function naturalCompare(left: string, right: string, budget: Budget): number {
  const a=fold(left),b=fold(right);let i=0,j=0;
  while(i<a.length||j<b.length){budget.step();
    while(/\s/.test(a[i]??'!'))i++;while(/\s/.test(b[j]??'!'))j++;
    if(/[0-9]/.test(a[i]??'!')&&/[0-9]/.test(b[j]??'!')){
      let ai=i,bj=j;while(/[0-9]/.test(a[i]??'!'))i++;while(/[0-9]/.test(b[j]??'!'))j++;
      const x=a.slice(ai,i),y=b.slice(bj,j);budget.step(x.length+y.length);
      if(x[0]==='0'||y[0]==='0'){if(x!==y)return x<y?-1:1;}
      else if(x.length!==y.length)return x.length-y.length;else if(x!==y)return x<y?-1:1;
    }else{const x=a[i]??'',y=b[j]??'';if(x!==y)return x<y?-1:1;i++;j++;}
  }return 0;
}

add('simplex_noise',[p('coordinates','list')],'float','Compute fixed-permutation simplex noise for one to four float coordinates.',([a],{budget})=>{
 const points=lst(a!).map(flt);if(points.length<1||points.length>4)fail('E_TYPE');if(points.some(v=>Math.abs(v)>100000000))fail('E_INVARG');budget.step(256);return finite(simplexNoise(points));
},true,['Port of the pinned server’s public-domain SimplexNoise1234 algorithm by Stefan Gustavson. Coordinates are restricted to ±100000000 to avoid native integer-index overflow.']);
