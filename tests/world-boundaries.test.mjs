import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,createRuntime,moo} from '../dist/index.js';

function tree(profile,limits) {
  const world=createWorld({profile,limits});
  world.addObject({id:0});world.addObject({id:1,parent:0,owner:0});world.addObject({id:2,parent:1,owner:2});
  return world;
}
const context={this:moo.object(1),player:moo.object(0)};
const verb={names:'f',owner:0n,perms:'rx',args:['none','none','none'],source:'return 8;'};
for(const profile of ['lambdamoo','toaststunt']) {
  test(`${profile}: rejected metadata and lifecycle mutations are atomic`,async t=>{
    const runtime=await createRuntime({profile});
    try {
      const cases=[
        ['property metadata length','add_property(#1,"x",1,{#0});','E_INVARG'],
        ['property metadata type','add_property(#1,"x",1,1);','E_TYPE'],
        ['property permissions','add_property(#1,"x",1,{#0,"z"});','E_INVARG'],
        ['property name type','add_property(#1,4,1,{#0,"r"});','E_TYPE'],
        ['property owner type','add_property(#1,"x",1,{1,"r"});','E_TYPE'],
        ['property owner missing','add_property(#1,"x",1,{#99,"r"});','E_INVARG'],
        ['reserved property','add_property(#1,"NaMe",1,{#0,"r"});','E_INVARG'],
        ['duplicate property','add_property(#1,"ScOrE",1,{#0,"r"});','E_INVARG'],
        ['descendant conflict','add_property(#0,"score",1,{#0,"r"});','E_INVARG'],
        ['delete inherited property','delete_property(#2,"score");','E_PROPNF'],
        ['clear local property','clear_property(#1,"score");','E_INVARG'],
        ['rename inherited property','set_property_info(#2,"score",{#0,"r","new"});','E_INVARG'],
        ['rename to reserved name','set_property_info(#1,"score",{#0,"r","owner"});','E_INVARG'],
        ['rename to descendant property','set_property_info(#1,"score",{#0,"r","local"});','E_INVARG'],
        ['invalid metadata update','set_property_info(#1,"score",{#0,"z"});','E_INVARG'],
        ['movement unsupported','#1.location=#2;','E_PERM'],
        ['contents read only','#1.contents={#2};','E_PERM'],
        ['invalid object name','#1.name=1;','E_TYPE'],
        ['invalid object owner','#1.owner=#99;','E_INVARG'],
        ['invalid flag type','#1.wizard="yes";','E_TYPE'],
        ['invalid create owner','create(#1,#99);','E_INVARG'],
        ['invalid create parent','create(#99);','E_INVARG'],
        ['verb metadata length','add_verb(#1,{#0,"rx"},{"none","none","none"});','E_INVARG'],
        ['verb permissions','set_verb_info(#1,"f",{#0,"z","f"});','E_INVARG'],
        ['empty verb name','set_verb_info(#1,"f",{#0,"rx",""});','E_INVARG'],
        ['verb argument specification','set_verb_args(#1,"f",{"invalid","none","none"});','E_INVARG'],
        ['verb preposition','set_verb_args(#1,"f",{"none","invalid","none"});','E_INVARG'],
        ['verb descriptor type','delete_verb(#1,{});','E_TYPE'],
        ['missing verb descriptor','delete_verb(#1,0);','E_VERBNF'],
        ['inherited verb deletion','delete_verb(#2,"f");','E_VERBNF'],
        ['source not a list','set_verb_code(#1,"f",1);','E_TYPE'],
        ['source line not a string','set_verb_code(#1,"f",{1});','E_TYPE'],
        ['unsupported formatting','verb_code(#1,"f",1);','E_INVARG'],
        ['formatting argument type','verb_code(#1,"f","x");','E_TYPE'],
        ['recycle hook','recycle(#1);','E_INVARG',w=>w.addVerb(1n,{...verb,names:'recycle'})],
      ];
      for(const [name,source,code,setup] of cases) await t.test(name,()=>{
        const world=tree(profile);world.addProperty(1n,'score',moo.int(10),0n,'rw');world.addProperty(2n,'local',moo.int(3),2n,'r');world.addVerb(1n,verb);setup?.(world);
        const before=runtime.saveWorld(world),next=world.nextId;
        const result=runtime.run(source,{world,context});
        assert.equal(result.status,'runtime-error',source);assert.equal(result.diagnostics[0].code,code,source);
        assert.deepEqual(result.changes,[]);assert.equal(runtime.saveWorld(world),before);assert.equal(world.nextId,next);
        assert.equal(runtime.run('return #1:f();',{world}).value.value,8n);
      });
    } finally {runtime.dispose();}
  });
  test(`${profile}: world quotas accept the boundary and reject whole mutations beyond it`,async t=>{
    const runtime=await createRuntime({profile});
    try {
      const cases=[
        ['objects',{objects:4},'create(#1);','create(#1);'],
        ['inherited property slots',{properties:2},'add_property(#1,"x",1,{#0,"r"});','add_property(#1,"y",2,{#0,"r"});'],
        ['verbs',{verbs:1},'add_verb(#1,{#0,"rx","f"},{"none","none","none"});','add_verb(#1,{#0,"rx","g"},{"none","none","none"});'],
        ['strings',{stringUnits:3},'#1.name="abc";','#1.name="abcd";'],
        ['stored values',{valueNodes:2},'add_property(#1,"x",{1},{#0,"r"});','#1.x={1,2};'],
        ['inheritance depth',{inheritanceDepth:4},'create(#2);','create(#3);'],
      ];
      for(const [name,limits,allowed,rejected] of cases) await t.test(name,()=>{
        const world=tree(profile,limits);
        assert.equal(runtime.run(allowed,{world,context}).status,'completed');
        const before=runtime.saveWorld(world),next=world.nextId;
        const result=runtime.run(rejected,{world,context});
        assert.equal(result.status,'limit-exceeded');assert.deepEqual(result.changes,[]);
        assert.equal(runtime.saveWorld(world),before);assert.equal(world.nextId,next);
        assert.equal(runtime.run('return 8;',{world}).value.value,8n);
      });
    } finally {runtime.dispose();}
  });
  test(`${profile}: c permission assigns inherited slots to each object's owner`,()=>{
    const world=tree(profile);
    world.addProperty(1n,'copy_owner',moo.int(10),0n,'rwc');
    world.addProperty(1n,'keep_owner',moo.int(20),0n,'rw');
    const added=world.addObject({parent:1,owner:2});
    for(const id of [2n,added]) {
      assert.equal(world.property(id,'copy_owner').owner,2n);assert.equal(world.property(id,'keep_owner').owner,0n);
      assert.equal(world.getProperty(id,'copy_owner').value,10n);
    }
    world.setProperty(2n,'copy_owner',moo.int(99));
    world.setPropertyInfo(1n,'copy_owner',0n,'rwc','renamed');
    assert.equal(world.getProperty(2n,'renamed').value,99n);assert.equal(world.property(2n,'renamed').owner,2n);
    world.clearProperty(2n,'renamed');assert.equal(world.getProperty(2n,'renamed').value,10n);
  });
}
