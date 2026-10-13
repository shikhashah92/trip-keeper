// Files picked on one screen and read on the next (a route's params can't carry a file). Cleared once the next screen has them.
import type { Picked } from './io';

let pending: Picked[] = [];
export const handOff = (files: Picked[]) => { pending = files; };
/** What was handed over, without taking it: safe to call while rendering. */
export const peekHandOff = () => pending;
export const clearHandOff = () => { pending = []; };

/** The file the in-app viewer (/file) shows: set just before navigating there. */
let viewing: Picked | null = null;
export const setViewing = (f: Picked | null) => { viewing = f; };
export const getViewing = () => viewing;
