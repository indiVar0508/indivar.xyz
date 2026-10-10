import { describe, expect, it } from 'vitest';
import { isHoodOpen, reduceView, SHOWROOM, type View } from './view';

const focus: View = { kind: 'focus', id: 'wheels' };
const bay: View = { kind: 'bay' };
const part: View = { kind: 'bay-part', id: 'crank' };

describe('reduceView', () => {
  it('opens the bay from the hood hotspot and focuses other car hotspots', () => {
    expect(reduceView(SHOWROOM, { type: 'select-car', id: 'hood' })).toEqual(bay);
    expect(reduceView(SHOWROOM, { type: 'select-car', id: 'wheels' })).toEqual(focus);
    expect(reduceView(part, { type: 'select-car', id: 'history' })).toEqual({ kind: 'focus', id: 'history' });
  });

  it('selects engine parts from anywhere', () => {
    expect(reduceView(bay, { type: 'select-part', id: 'crank' })).toEqual(part);
    expect(reduceView(SHOWROOM, { type: 'select-part', id: 'fuel' })).toEqual({ kind: 'bay-part', id: 'fuel' });
  });

  it('goes back one level at a time', () => {
    expect(reduceView(part, { type: 'back' })).toEqual(bay);
    expect(reduceView(bay, { type: 'back' })).toBe(SHOWROOM);
    expect(reduceView(focus, { type: 'back' })).toBe(SHOWROOM);
    expect(reduceView(SHOWROOM, { type: 'back' })).toBe(SHOWROOM);
  });

  it('closes the hood only when it is open', () => {
    expect(reduceView(part, { type: 'close-hood' })).toBe(SHOWROOM);
    expect(reduceView(focus, { type: 'close-hood' })).toBe(focus);
  });

  it('knows when the hood is open', () => {
    expect([SHOWROOM, focus, bay, part].map(isHoodOpen)).toEqual([false, false, true, true]);
  });
});
