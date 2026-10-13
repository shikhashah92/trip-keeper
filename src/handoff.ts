// Files picked on one screen and read on the next (a route's params can't carry a file). Cleared once the next screen has them.
import type { Picked } from './io';

let pending: Picked[] = [];
export const handOff = (files: Picked[]) => { pending = files; };
/** What was handed over, without taking it: safe to call while rendering. */
export const peekHandOff = () => pending;
export const clearHandOff = () => { pending = []; };
