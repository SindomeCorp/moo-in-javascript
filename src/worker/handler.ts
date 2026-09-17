import { transferCapacity } from './capacity.js';
import { createWorld } from '../world/index.js';
import { createParser } from '../parser/index.js';
import { createRuntime, type InvocationContext } from '../runtime/index.js';
import { decodeValue, encodeValue } from '../values/index.js';
import type { HostVerbRegistrations } from '../runtime/registrations.js';
import type { WorkerRequest, WorkerResponse, WireResult } from './protocol.js';

/** Install this handler in a dedicated worker; host registrations stay in that worker. */
export function createWorkerHandler(send: (message: WorkerResponse) => void, hostVerbs: HostVerbRegistrations = {}): (request: WorkerRequest) => Promise<void> {
  let queue = Promise.resolve();
  let cachedRuntime: Awaited<ReturnType<typeof createRuntime>> | undefined;
  let runtimeKey: string | undefined, worldKey: string | undefined, savedSnapshot: string | undefined;
  let cachedWorld: ReturnType<typeof createWorld> | undefined;
  return request => {
    queue = queue.then(async () => {
      if (!request || typeof request.id !== 'string') return;
      try {
        if (request.type === 'parse') {
          const parser = await createParser(request.options);
          try { send({ type: 'parsed', id: request.id, result: parser.parse(request.source) }); }
          finally { parser.dispose(); }
        } else if (request.type === 'execute' || request.type === 'warmup') {
          const key=JSON.stringify(request.options);
          if(!cachedRuntime || runtimeKey!==key){
            cachedRuntime?.dispose();cachedRuntime=undefined;cachedWorld=undefined;savedSnapshot=undefined;
            cachedRuntime=await createRuntime({...request.options,hostVerbs});runtimeKey=key;
          }
          const runtime=cachedRuntime;
          {
            const configured = createWorld({ profile: runtime.profile, limits: request.worldLimits });
            const capacity = transferCapacity(configured.limits);
            const nextWorldKey=JSON.stringify([configured.limits,request.unsupportedSourcePolicy??'reject']);
            const world=cachedWorld && worldKey===nextWorldKey && savedSnapshot===request.snapshot ? cachedWorld
              : runtime.loadWorld(request.snapshot,{world:configured,limits:capacity,unsupportedSourcePolicy:request.unsupportedSourcePolicy??'reject'});
            cachedWorld=world;worldKey=nextWorldKey;savedSnapshot=request.snapshot;
            if(request.type==='warmup'){send({type:'warmed',id:request.id});return;}

            const context: InvocationContext = {};
            for (const key of ['this', 'player', 'caller'] as const) {
              const value = request.context?.[key];
              if (value !== undefined) context[key] = decodeValue(value, request.options);
            }
            if (request.context?.args) context.args = request.context.args.map(value => decodeValue(value, request.options));
            if (request.context?.verb !== undefined) context.verb = request.context.verb;
            const result = await runtime.runAsync(request.source, { world, context, ...(request.limits ? { limits: request.limits } : {}), runId: request.id,
              onOutput(event) { send({ type: 'output', id: request.id, event: { ...event, recipient: encodeValue(event.recipient, request.options) } }); } });
            const base = { statistics: result.statistics, commit: result.commit };
            let wire: WireResult;
            if (result.status === 'completed') {
              wire = { ...base, status: result.status, value: encodeValue(result.value, request.options), diagnostics: [] };
            } else if (result.status === 'runtime-error' || result.status === 'limit-exceeded') {
              wire = { ...base, status: result.status, diagnostics: result.diagnostics.map(diagnostic => ({ ...diagnostic,
                stack: diagnostic.stack.map(frame => ({ ...frame, this: String(frame.this), definer: String(frame.definer), player: String(frame.player), caller: String(frame.caller), programmer: String(frame.programmer) })) })) };
            } else wire = { ...base, status: result.status, diagnostics: result.diagnostics as readonly import('../ast/source.js').Diagnostic[] };
            savedSnapshot=runtime.saveWorld(world,capacity);
            send({ type: 'terminal', id: request.id, result: wire, snapshot: savedSnapshot, outputCount: result.output.length });
          }
        }
      } catch (error) { cachedWorld=undefined;savedSnapshot=undefined;send({ type: 'host-error', id: request.id, message: error instanceof Error ? error.message : String(error) }); }
    });
    return queue;
  };
}
