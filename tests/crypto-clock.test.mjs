import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {createRuntime,createWorkerSession,moo} from '../dist/index.js';
import {nodeWorkerFactory} from '../dist/worker/node-client.js';
import {createTestWorld} from './helpers/world.mjs';
const S=moo.string,I=moo.int;
test('hashes and HMACs match independent Node crypto vectors',async()=>{
 const r=await createRuntime({profile:'toaststunt'});
 try{
  for(const algorithm of ['md5','sha1','sha224','sha256','sha384','sha512','ripemd160']){
   for(const binary of [0,1])for(const mac of [false,true]){
    const digest=(mac?createHmac(algorithm,Buffer.from([0,255])):createHash(algorithm)).update('abc').digest('hex').toUpperCase();
    const result=r.run(`return ${mac?'string_hmac':'string_hash'}("abc",${mac?'"~00~FF",':''}"${algorithm}",${binary});`);
    assert.equal(result.status,'completed');assert.deepEqual(result.value,S(binary?digest.replace(/../g,b=>'~'+b):digest));
   }
  }
  for(const source of ['string_hash("a","unknown")','binary_hash("~")','string_hmac("a","~")','random_bytes(-1)','random_bytes(10001)','argon2("p","short")','argon2("p","saltsalt",0)','argon2("p","saltsalt",1,7)','argon2("p","saltsalt",1,8,2)']){
   const result=r.run('return '+source+';');assert.equal(result.status,'runtime-error',source);assert.equal(result.diagnostics[0].code,'E_INVARG',source);
  }
  const hash='$argon2id$v=19$m=8,t=1,p=1$c2FsdHNhbHQ$ePHX6tepXWusf6b6MH9TJ+SVGted3R/FtCkxq/X5UVo';
  for(const encoded of ['bad',hash.replace('m=8','m=999999999'),hash.replace('t=1','t=99'),hash.replace('c2FsdHNhbHQ','YQ'),hash.replace('c2FsdHNhbHQ','YQ==='),hash.replace(/\$[^$]+$/,'$YWJj')])assert.deepEqual(r.run(`return argon2_verify("${encoded}","password");`).value,I(0));
  assert.deepEqual(r.run(`return argon2_verify("${hash}","wrong");`).value,I(0));
  assert.equal(r.run('return argon2("password","saltsalt");',{limits:{allocations:100}}).status,'limit-exceeded');
  assert.equal(r.run('return length(argon2("password","saltsalt"));').status,'completed');
  assert.equal(r.run('return length(decode_binary(random_bytes(100),1));').value.value,100n);
  const world=createTestWorld({profile:'toaststunt'}),session=createWorkerSession({runtime:r,world,workerFactory:nodeWorkerFactory()});
  const result=await session.run('return {string_hash("abc"),argon2("password","saltsalt",1,8),task_id()>0};').result;assert.equal(result.status,'completed');assert.equal(result.value.value[2].value,1n);
 }finally{r.dispose();}
});
for(const profile of ['lambdamoo','toaststunt'])test(`${profile}: clock, random ranges, and elapsed-time limits`,async()=>{
 const r=await createRuntime({profile});
 try{
  assert.equal(r.run('return random(0);').diagnostics[0].code,'E_INVARG');assert.equal(r.run('return random("1");').diagnostics[0].code,'E_TYPE');
  const run=r.run('return {time(),ctime(),random(),seconds_left()};');assert.equal(run.status,'completed');assert.ok(Number(run.value.value[0].value)<=Date.now()/1000);assert.ok(run.value.value[1].value.endsWith(' UTC'));assert.ok(run.value.value[2].value>=1n);assert.ok(run.value.value[3].value<=30n);
  assert.equal(r.run('return 1;',{limits:{seconds:0}}).diagnostics[0].message,'Execution seconds limit exceeded');
  if(profile==='toaststunt'){
   for(const expression of ['random(-9223372036854775807,9223372036854775807)','random(-10,-1)','frandom(-1.0,1.0)','ftime(1)','ftime(2)'])assert.equal(r.run('return '+expression+';').status,'completed');
   assert.equal(r.run('return random(2,1);').diagnostics[0].code,'E_INVARG');assert.equal(r.run('return ctime(9223372036854775807);').diagnostics[0].code,'E_INVARG');
   assert.equal(r.run('return ftime("x");').diagnostics[0].code,'E_TYPE');assert.equal(r.run('return frandom(1);').diagnostics[0].code,'E_TYPE');
  }else assert.equal(r.run('return random(1,2);').diagnostics[0].code,'E_ARGS');
 }finally{r.dispose();}
});
