import { MooError } from './errors.js';
export interface Suspension { readonly milliseconds: number }
export type Evaluation<T> = Generator<Suspension, T, void>;

/** Synchronous callers cannot wait; inject a catchable error at the call site. */
export function finishSync<T>(task: Evaluation<T>): T {
  let step = task.next();
  while (!step.done) step = task.throw(new MooError('E_INVARG', 'suspend() requires runAsync() or a worker session'));
  return step.value;
}
export async function finishAsync<T>(task: Evaluation<T>): Promise<T> {
  let step = task.next();
  while (!step.done) {
    const milliseconds = step.value.milliseconds;
    await new Promise<void>(resolve => setTimeout(resolve, milliseconds));
    step = task.next();
  }
  return step.value;
}
