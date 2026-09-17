import type { Utility } from './utilities.js';
import { int,flt,text,finite } from './utilities.js';
import { secureBytes } from './crypto.js';
import { moo } from '../values/index.js';
import { wrap } from '../values/operations.js';
import { fail } from '../runtime/errors.js';
const p=(name:string,types:Utility['parameters'][number]['types'],optional=false)=>({name,types,optional,description:name+'.'});
export const clockBuiltins:Utility[]=[
 {name:'time',parameters:[],returns:'int',summary:'Return seconds since the Unix epoch.',notes:['Uses the host wall clock.'],invoke:(_,{profile})=>wrap(BigInt(Math.floor(Date.now()/1000)),profile)},
 {name:'ctime',parameters:[p('time',['int'],true)],returns:'string',summary:'Format a Unix timestamp as a readable date.',notes:['Limited: always uses UTC for consistent browser and Node results.'],invoke:([a],{budget})=>{
  const date=new Date(a?Number(int(a))*1000:Date.now());if(!Number.isFinite(date.getTime()))fail('E_INVARG');
  const day=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][date.getUTCDay()],month=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][date.getUTCMonth()];
  const two=(n:number)=>String(n).padStart(2,'0');return text(`${day} ${month} ${String(date.getUTCDate()).padStart(2,' ')} ${two(date.getUTCHours())}:${two(date.getUTCMinutes())}:${two(date.getUTCSeconds())} ${date.getUTCFullYear()} UTC`,budget);
 }},
 {name:'ftime',profiles:['toaststunt'],parameters:[p('monotonic',['int'],true)],returns:'float',summary:'Return fractional wall-clock or monotonic seconds.',notes:['Any supplied integer selects performance.now(); monotonic raw mode uses the same host clock.'],invoke:([a])=>{if(a)int(a);return moo.float(a?performance.now()/1000:Date.now()/1000);}},
 {name:'seconds_left',parameters:[],returns:'int',summary:'Return whole seconds remaining in this execution’s time budget.',notes:['Default execution time budget is 30 seconds; worker timeout can stop execution sooner.'],invoke:(_,{budget})=>moo.int(Math.ceil(budget.remainingSeconds()))},
 {name:'random',parameters:[p('maximumOrMinimum',['int'],true),p('maximum',['int'],true)],returns:'int',summary:'Choose an integer uniformly within an inclusive range.',notes:['One argument selects 1..maximum; ToastStunt also accepts minimum, maximum. Uses host Web Crypto, without deterministic seeding.'],invoke:([a,b],{budget,profile})=>{
  const min=b?int(a!):1n,max=b?int(b):a?int(a):(1n<<(profile==='lambdamoo'?31n:63n))-1n;if(max<min)fail('E_INVARG');
  const range=max-min+1n;if(range===1n)return moo.int(min);const bits=(range-1n).toString(2).length,bytes=Math.ceil(bits/8),mask=(1n<<BigInt(bits))-1n;
  while(true){let n=0n;for(const byte of secureBytes(bytes,budget))n=(n<<8n)|BigInt(byte);n&=mask;if(n<range)return moo.int(min+n);}
 }},
 {name:'frandom',profiles:['toaststunt'],parameters:[p('maximumOrMinimum',['float']),p('maximum',['float'],true)],returns:'float',summary:'Choose a floating-point value within a range.',notes:['Uses host Web Crypto; endpoints follow floating-point rounding.'],invoke:([a,b],{budget})=>{
  const min=b?flt(a!):0,max=b?flt(b):flt(a!);const bytes=secureBytes(7,budget);let n=0n;for(const byte of bytes)n=(n<<8n)|BigInt(byte);const fraction=Number(n>>3n)/9007199254740992;return finite(min*(1-fraction)+max*fraction);
 }},
 {name:'reseed_random',profiles:['toaststunt'],parameters:[],returns:'int',summary:'Compatibility no-op for a generator that draws fresh host entropy.',notes:['No persistent PRNG seed exists: random() already reads Web Crypto on every draw. Returns 0; no wizard checks.'],invoke:()=>moo.int(0)},
];
