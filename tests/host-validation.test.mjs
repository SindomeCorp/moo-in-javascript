import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRuntime,createWorld,createWorkerSession,HostError,moo} from '../dist/index.js';
import {nodeWorkerFactory} from '../dist/worker/node-client.js';
import {createTestWorld} from './helpers/world.mjs';
for(const profile of ['lambdamoo','toaststunt']) {
  test(`${profile}: invalid execution options reject without changing or locking the world`,async t=>{
    const runtime=await createRuntime({profile}),world=createTestWorld({profile});
    try {
      const invalid=[
        ['onOutput',{onOutput:3}],['empty runId',{runId:''}],['non-string runId',{runId:1}],['long runId',{runId:'x'.repeat(257)}],
        ['verb',{context:{verb:5}}],...['this','player','caller'].map(key=>[key,{context:{[key]:moo.int(1)}}]),
        ['unowned args',{context:{args:[{type:'int',value:1n}]}}],
      ];
      for(const limit of ['steps','allocations','evaluationDepth','callDepth','outputCharacters','outputEvents']) {
        for(const value of [-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])invalid.push([`${limit}=${value}`,{limits:{[limit]:value}}]);
      }
      invalid.push(['evaluationDepth cap',{limits:{evaluationDepth:257}}],['callDepth cap',{limits:{callDepth:101}}]);
      for(const [name,options] of invalid)await t.test(name,()=>{
        const before=runtime.saveWorld(world);
        assert.throws(()=>runtime.run('this.lamp_on=9;',{world,...options}),HostError);
        assert.equal(runtime.saveWorld(world),before);
        assert.equal(runtime.run('return 4;',{world}).value.value,4n);
      });
      assert.equal(runtime.run('return 1;',{world,runId:'x'.repeat(256),limits:{callDepth:100,evaluationDepth:256}}).status,'completed');
      const foreign=createWorld({profile:profile==='lambdamoo'?'toaststunt':'lambdamoo'});
      assert.throws(()=>runtime.saveWorld(foreign),HostError);
      assert.throws(()=>world.replaceWith(foreign),HostError);
    } finally {runtime.dispose();}
  });
  test(`${profile}: depth and output event exhaustion remain controlled`,async t=>{
    const runtime=await createRuntime({profile});
    try {
      for(const limits of [{evaluationDepth:0},{callDepth:0}])await t.test(Object.keys(limits)[0],()=>{
        const world=createTestWorld({profile}),before=runtime.saveWorld(world);
        const result=runtime.run('try return 1; finally this.lamp_on=99; endtry',{world,context:{this:moo.object(42)},limits});
        assert.equal(result.status,'limit-exceeded');assert.equal(runtime.saveWorld(world),before);
        assert.equal(runtime.run('return 1;',{world}).status,'completed');
      });
      const world=createTestWorld({profile}),context={this:moo.object(42),player:moo.object(7)};
      assert.equal(runtime.run('notify(player,"");',{world,context,limits:{outputEvents:1,outputCharacters:0}}).status,'completed');
      const result=runtime.run('this.lamp_on=1; try notify(player,""); notify(player,""); finally this.lamp_on=99; endtry',{world,context,limits:{outputEvents:1}});
      assert.equal(result.status,'limit-exceeded');assert.equal(result.output.length,1);assert.equal(result.statistics.outputEvents,1);
      assert.equal(world.getProperty(42n,'lamp_on').value,1n);
      assert.equal(runtime.run('notify(player,"");',{world,context,limits:{outputEvents:0}}).status,'limit-exceeded');
    }finally{runtime.dispose();}
  });
  test(`${profile}: invalid worker deadlines and contexts allow a subsequent valid run`,async t=>{
    const runtime=await createRuntime({profile}),world=createTestWorld({profile});
    try {
      const session=createWorkerSession({runtime,world,workerFactory:nodeWorkerFactory()});
      for(const timeoutMs of [0,-1,0.5,NaN,Infinity,2147483648]) await t.test(`timeout ${timeoutMs}`,()=>{
        const before=session.save();assert.throws(()=>session.run('return 1;',{timeoutMs}),HostError);assert.equal(session.save(),before);assert.equal(session.busy,false);
      });
      const before=session.save();
      await assert.rejects(session.run('return 1;',{context:{this:moo.int(1)}}).result,HostError);
      assert.equal(session.save(),before);assert.equal(session.busy,false);
      assert.equal((await session.run('return 1;').result).value.value,1n);
    }finally{runtime.dispose();}
  });
}
test('invalid world limits reject at construction',async t=>{
  for(const key of ['objects','properties','verbs','valueNodes','stringUnits','inheritanceDepth']) {
    for(const value of [-1,0.5,NaN,Infinity])await t.test(`${key}=${value}`,()=>assert.throws(()=>createWorld({profile:'toaststunt',limits:{[key]:value}}),HostError));
  }
  assert.throws(()=>createWorld({profile:'toaststunt',limits:{inheritanceDepth:257}}),HostError);
});
test('invalid host registration shapes and IDs fail without poisoning parser initialization',async t=>{
  const cases=[['null',null],['array',[]],['function',()=>{}],['invalid ID',{'has space':()=>moo.int(0)}],['long ID',{['x'.repeat(129)]:()=>moo.int(0)}],['nonfunction',{valid:3}]];
  for(const [name,hostVerbs] of cases)await t.test(name,async()=>{
    await assert.rejects(createRuntime({profile:'toaststunt',hostVerbs}),HostError);
    const valid=await createRuntime({profile:'toaststunt'});try{assert.equal(valid.run('return 2;').value.value,2n);}finally{valid.dispose();}
  });
});
test('invalid host charges and asynchronous results bypass MOO handlers and release the world',async t=>{
  for(const [name,implementation] of [
    ['negative allocations',host=>host.chargeAllocations(-1)],
    ['noninteger allocations',host=>host.chargeAllocations(0.5)],
    ['nonfinite steps',host=>host.chargeSteps(NaN)],
    ['async result',async()=>moo.int(1)],
  ])await t.test(name,async()=>{
    const runtime=await createRuntime({profile:'toaststunt',hostVerbs:{probe:implementation}}),world=createTestWorld({profile:'toaststunt'});
    try {
      world.addVerb(42n,{names:'probe',owner:7n,perms:'rx',args:['none','none','none'],source:'',hostId:'probe'});
      const before=runtime.saveWorld(world);
      assert.throws(()=>runtime.run('try try this:probe(); except (ANY) this.lamp_on=8; endtry finally this.lamp_on=9; endtry',{world,context:{this:moo.object(42)}}),HostError);
      assert.equal(runtime.saveWorld(world),before);assert.equal(runtime.run('return 3;',{world}).value.value,3n);
    }finally{runtime.dispose();}
  });
});
