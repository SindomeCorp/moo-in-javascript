import unixCrypt from 'unix-crypt-td-js';
import { sha224,sha256,sha384,sha512 } from '@noble/hashes/sha2.js';
import { md5,sha1,ripemd160 } from '@noble/hashes/legacy.js';
import { hmac } from '@noble/hashes/hmac.js';
import { argon2id } from '@noble/hashes/argon2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { Utility } from './utilities.js';
import { str,int,text } from './utilities.js';
import { binaryDecode,binaryEncode } from './codecs.js';
import { moo,type MooValue } from '../values/index.js';
import { truth,fold } from '../values/operations.js';
import { format } from '../values/format.js';
import { fail } from '../runtime/errors.js';
import type { Budget } from '../runtime/budget.js';
const p=(name:string,types:Utility['parameters'][number]['types'],optional=false)=>({name,types,optional,description:name+'.'});
const algorithms={md5,sha1,sha224,sha256,sha384,sha512,ripemd160};
export const cryptoBuiltins:Utility[]=[];
function utf8(source:string,budget:Budget):Uint8Array {budget.step(source.length);budget.allocate(source.length*3);return new TextEncoder().encode(source);}
for(const kind of ['string','binary','value'])for(const mac of [false,true]){
 const name=kind+(mac?'_hmac':'_hash');
 cryptoBuiltins.push({name,parameters:[p('value',[kind==='value'?'any':'string']),...(mac?[p('key',['string'])]:[]),p('algorithm',['string'],true),p('binary',['any'],true)],returns:'string',summary:mac?'Compute a keyed HMAC.':'Compute a cryptographic digest.',...(mac?{profiles:['toaststunt'] as ['toaststunt']}: {}),notes:['Real MD5, SHA-1, SHA-224/256/384/512 and RIPEMD-160 implementations. LambdaMOO uses MD5 with one argument; ToastStunt defaults to SHA-256. Text is encoded as UTF-8; binary strings use ~XX bytes. Hex output is uppercase; binary output escapes every byte.'],invoke:(args,{profile,budget})=>{
  const algorithm=fold(args[mac?2:1]?str(args[mac?2:1]!):profile==='lambdamoo'?'md5':'sha256');if(!Object.hasOwn(algorithms,algorithm))fail('E_INVARG');
  const fn=algorithms[algorithm as keyof typeof algorithms],input=kind==='binary'?Uint8Array.from(binaryDecode(str(args[0]!),budget)):utf8(kind==='value'?format(args[0]!,true,budget):str(args[0]!),budget);
  budget.step(input.length+128);budget.allocate(fn.outputLen*4);
  const digest=mac?hmac(fn,Uint8Array.from(binaryDecode(str(args[1]!),budget)),input):fn(input),hex=bytesToHex(digest).toUpperCase(),binary=args[mac?3:2];
  return moo.string(binary&&truth(binary)?hex.replace(/../g,byte=>'~'+byte):hex);
 }});
}
export function secureBytes(length:number,budget:Budget):Uint8Array {
 budget.allocate(length);budget.step(length+1);if(!globalThis.crypto?.getRandomValues)fail('E_INVARG','Secure randomness is unavailable in this host');return globalThis.crypto.getRandomValues(new Uint8Array(length));
}
cryptoBuiltins.push({name:'random_bytes',profiles:['toaststunt'],parameters:[p('length',['int'])],returns:'string',summary:'Generate cryptographically random bytes as a binary string.',notes:['Requires host Web Crypto. Length must be between 0 and 10000.'],invoke:([a],{budget})=>{const length=int(a!);if(length<0n||length>10000n)fail('E_INVARG');return binaryEncode([...secureBytes(Number(length),budget)],budget);}});
function base64(bytes:Uint8Array):string {let s='';for(const c of bytes)s+=String.fromCharCode(c);return btoa(s).replace(/=+$/,'');}
function argon(password:string,salt:Uint8Array,t:number,m:number,p:number,budget:Budget):Uint8Array {
 if(!Number.isSafeInteger(t)||!Number.isSafeInteger(m)||!Number.isSafeInteger(p)||t<1||t>10||p!==1||m<8||m>16384||salt.length<8)fail('E_INVARG','Argon2 requires t=1–10, m=8–16384 KiB, p=1 and at least 8 salt bytes');
 // Charge logical 1 KiB blocks; a separate hard cap bounds actual temporary memory.
 budget.step(t*m*4);budget.allocate(m*8+password.length*3+salt.length+32);
 return argon2id(new TextEncoder().encode(password),salt,{t,m,p,dkLen:32,maxmem:20*1024*1024});
}
cryptoBuiltins.push({name:'argon2',profiles:['toaststunt'],parameters:[p('password',['string']),p('salt',['string']),p('iterations',['int'],true),p('memoryKiB',['int'],true),p('parallelism',['int'],true)],returns:'string',summary:'Compute an Argon2id password hash in PHC format.',notes:['Real Argon2id v19; defaults t=3, m=4096 KiB, p=1. Limited to t≤10, memory≤16384 KiB, p=1. Runs synchronously and charges budgets; no native threads or wizard permission checks. Invalid parameters raise E_INVARG.'],invoke:([a,b,c,d,e],{budget})=>{
 const password=str(a!),salt=utf8(str(b!),budget),t=c?Number(int(c)):3,m=d?Number(int(d)):4096,p=e?Number(int(e)):1;
 const digest=argon(password,salt,t,m,p,budget);return text(`$argon2id$v=19$m=${m},t=${t},p=${p}$${base64(salt)}$${base64(digest)}`,budget);
}});
cryptoBuiltins.push({name:'argon2_verify',profiles:['toaststunt'],parameters:[p('hash',['string']),p('password',['string'])],returns:'int',summary:'Verify a supported Argon2id PHC hash.',notes:['Uses the same cost and p=1 limits as argon2(). Malformed or unsupported hashes return 0; execution limits still propagate.'],invoke:([a,b],{budget})=>{
 const encoded=str(a!),password=str(b!);budget.step(encoded.length);
 const match=/^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=1\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/.exec(encoded);if(!match)return moo.int(0);
 const m=Number(match[1]),t=Number(match[2]);if(m<8||m>16384||t<1||t>10)return moo.int(0);
 let salt:Uint8Array,expected:Uint8Array;try{salt=Uint8Array.from(atob(match[3]!),c=>c.charCodeAt(0));expected=Uint8Array.from(atob(match[4]!),c=>c.charCodeAt(0));}catch{return moo.int(0);}
 if(salt.length<8||expected.length!==32)return moo.int(0);const actual=argon(password,salt,t,m,1,budget);let difference=0;for(let i=0;i<32;i++)difference|=actual[i]!^expected[i]!;return moo.int(difference===0?1:0);
}});
const cryptAlphabet='./0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
cryptoBuiltins.push({name:'crypt',parameters:[p('password',['string']),p('salt',['string'],true)],returns:'string',summary:'Compute a traditional DES Unix crypt hash.',notes:['Limited: supports traditional two-character DES salts in both profiles. Modern $1$, $2$, $5$, $6$ schemes are rejected. Kept for MOO compatibility; not a modern password storage algorithm.'],invoke:([a,b],{budget})=>{
 const password=str(a!);let salt=b?str(b):'';if(salt.length<2){const bytes=secureBytes(2,budget);salt=cryptAlphabet[bytes[0]!&63]!+cryptAlphabet[bytes[1]!&63]!;}
 if(!/^[./0-9A-Za-z]{2}/.test(salt))fail('E_INVARG');budget.step(password.length+4096);budget.allocate(13);return moo.string(unixCrypt([...utf8(password,budget)],salt.slice(0,2)));
}});
cryptoBuiltins.push({name:'salt',profiles:['toaststunt'],parameters:[p('prefix',['string']),p('entropy',['string'])],returns:'string',summary:'Build a traditional DES salt from binary input bytes.',notes:['Limited: accepts an empty prefix or a traditional DES prefix. Modular crypt prefixes ($1$, $2$, $5$, $6$) are unsupported. Requires at least two input bytes.'],invoke:([a,b],{budget})=>{
 const prefix=str(a!),bytes=binaryDecode(str(b!),budget);if(prefix!==''&&!/^[./0-9A-Za-z]{2}/.test(prefix)||bytes.length<2)fail('E_INVARG');return text(cryptAlphabet[bytes[0]!&63]!+cryptAlphabet[bytes[1]!&63]!,budget);
}});
