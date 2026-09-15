import { parentPort } from 'node:worker_threads';
import { createWorkerHandler } from './handler.js';
if (!parentPort) throw new Error('The worker entry must run in a worker thread');
const port = parentPort;
const handle = createWorkerHandler(message => port.postMessage(message));
port.on('message', handle);
