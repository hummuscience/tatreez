import type { Region, Step } from '../types';
import { strategyRowHalves } from './rowHalves';
import { strategyColHalves } from './colHalves';
import { strategyGreedy } from './greedy';
import { strategyContour } from './contour';
import { strategyMirroredPairs } from './mirroredPairs';

export interface Strategy {
  name: string;
  fn: (region: Region) => Step[];
}

export const STRATEGIES: Strategy[] = [
  { name: 'Row halves', fn: strategyRowHalves },
  { name: 'Column halves', fn: strategyColHalves },
  { name: 'Greedy', fn: strategyGreedy },
  { name: 'Contour + fill', fn: strategyContour },
  { name: 'Mirrored pairs', fn: strategyMirroredPairs },
];

export {
  strategyRowHalves,
  strategyColHalves,
  strategyGreedy,
  strategyContour,
  strategyMirroredPairs,
};
