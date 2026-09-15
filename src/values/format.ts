import type { Budget } from '../runtime/budget.js';
import { errorMessages } from '../runtime/errors.js';
import type { MooValue } from './index.js';

/** C double's DBL_DIG (15) significant digits, matching the reference formatter. */
function floatText(value: number): string {
  if (Object.is(value, -0)) return '-0.0';
  const negative = value < 0, [mantissa, exponentText] = Math.abs(value).toExponential(14).split('e');
  const exponent = Number(exponentText), digits = mantissa!.replace('.', '').replace(/0+$/, '') || '0';
  let text: string;
  if (exponent < -4 || exponent >= 15) {
    text = digits[0] + (digits.length > 1 ? '.' + digits.slice(1) : '') + 'e' + (exponent < 0 ? '-' : '+') + String(Math.abs(exponent)).padStart(2, '0');
  } else {
    const at = exponent + 1;
    text = at <= 0 ? '0.' + '0'.repeat(-at) + digits : at >= digits.length ? digits + '0'.repeat(at - digits.length) + '.0' : digits.slice(0, at) + '.' + digits.slice(at);
  }
  return (negative ? '-' : '') + text;
}

export function format(value: MooValue, literal: boolean, budget: Budget): string {
  const parts: string[] = [];
  const pending: (MooValue | string)[] = [value];
  while (pending.length) {
    budget.step();
    const current = pending.pop()!;
    if (typeof current === 'string') { budget.allocate(current.length); parts.push(current); continue; }
    switch (current.type) {
      case 'int': pending.push(String(current.value)); break;
      case 'object': pending.push('#' + current.value); break;
      case 'float': pending.push(floatText(current.value)); break;
      case 'error': pending.push(literal ? current.value : errorMessages[current.value]); break;
      case 'string':
        budget.step(current.value.length);
        if (literal) {
          budget.allocate(current.value.length * 2 + 2);
          pending.push('"' + current.value.replace(/["\\]/g, '\\$&') + '"');
        } else pending.push(current.value);
        break;
      case 'list':
        if (!literal) { pending.push('{list}'); break; }
        budget.allocate(current.value.length * 2 + 2);
        pending.push('}');
        for (let i = current.value.length - 1; i >= 0; i--) { pending.push(current.value[i]!); if (i) pending.push(', '); }
        pending.push('{'); break;
      case 'map':
        if (!literal) { pending.push('[map]'); break; }
        budget.allocate(current.value.length * 4 + 2);
        pending.push(']');
        for (let i = current.value.length - 1; i >= 0; i--) {
          pending.push(current.value[i]![1], ' -> ', current.value[i]![0]); if (i) pending.push(', ');
        }
        pending.push('['); break;
    }
  }
  return parts.join('');
}
