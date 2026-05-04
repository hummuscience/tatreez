import { useEffect, useRef } from 'react';
import type { Pattern } from '../engine/types';
import { cellSize, drawPatternBackground } from './canvasUtil';

interface Props {
  pattern: Pattern;
  width?: number;
  height?: number;
}

export default function PatternThumb({ pattern, width = 130, height = 100 }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const cs = cellSize(canvas.width, canvas.height, pattern.width, pattern.height);
    const ox = (canvas.width - cs * pattern.width) / 2;
    const oy = (canvas.height - cs * pattern.height) / 2;
    ctx.save();
    ctx.translate(ox, oy);
    drawPatternBackground(ctx, pattern, cs);
    ctx.restore();
  }, [pattern]);

  return <canvas ref={ref} width={width} height={height} />;
}
