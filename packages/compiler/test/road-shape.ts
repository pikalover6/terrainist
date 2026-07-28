/**
 * The zigzag measure both the unit and the end-to-end road tests use.
 *
 * A staircase is an *orthogonal* alternation — north, east, north, east — which
 * is what a 4-connected search produces when it wants to travel diagonally and
 * has no word for it. A run of true diagonal steps, or a diagonal alternating
 * with a straight, is a line at an angle and is exactly what we want, so
 * neither counts here.
 *
 * The result is the number of consecutive alternations in the longest such run,
 * where 2 is one L-bend and back (harmless) and 3 or more is a visible flight
 * of steps.
 */
export function longestOrthogonalZigzag(
  path: readonly { readonly x: number; readonly z: number }[],
): number {
  const steps: string[] = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as { x: number; z: number };
    const b = path[i] as { x: number; z: number };
    steps.push(`${Math.sign(b.x - a.x)},${Math.sign(b.z - a.z)}`);
  }
  const orthogonal = (s: string): boolean => {
    const [dx, dz] = s.split(",").map(Number) as [number, number];
    return (dx === 0) !== (dz === 0);
  };
  let best = 0;
  for (let i = 0; i + 1 < steps.length; i++) {
    const a = steps[i] as string;
    const b = steps[i + 1] as string;
    if (a === b || !orthogonal(a) || !orthogonal(b)) continue;
    let run = 1;
    let j = i + 2;
    while (j < steps.length && steps[j] === steps[j - 2]) {
      run++;
      j++;
    }
    if (run > best) best = run;
    i = j - 2;
  }
  return best;
}
