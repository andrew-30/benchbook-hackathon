import { useEffect, useState } from 'react';

/**
 * Animates a number from 0 up to `target` using an ease-out cubic curve.
 *
 * - When `enabled` is false (e.g. while the source data is still loading), the
 *   hook returns 0 — kicking the animation off only once real values land.
 * - When `target === 0` we skip the animation entirely and return 0 directly,
 *   so empty states don't briefly flash a "0 → 0" tween.
 */
export function useCountUp(target: number, duration = 800, enabled = true) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled || target === 0) {
      setCount(target);
      return;
    }

    let startTime: number | null = null;
    let raf = 0;

    const animate = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);

      // Ease-out cubic — fast at the start, gentle at the finish.
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));

      if (progress < 1) {
        raf = requestAnimationFrame(animate);
      } else {
        setCount(target);
      }
    };

    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, enabled]);

  return count;
}
