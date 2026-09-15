import { createWorkerHandler } from './handler.js';
import type { WorkerRequest } from './protocol.js';
export type { ParseRequest, WorkerRequest, WorkerResponse } from './protocol.js';
const scope = globalThis as unknown as DedicatedWorkerGlobalScope;
const handle = createWorkerHandler(message => scope.postMessage(message));
scope.addEventListener('message', (event: MessageEvent<WorkerRequest>) => { void handle(event.data); });
