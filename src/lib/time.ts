/** Server-clock helper kept out of component files for render-purity linting. */
export function nowMs(): number {
  return Date.now();
}
