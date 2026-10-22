// DESIGN.md A4: "enter from the start edge" means +x in RTL and -x in LTR.
// Motion code asks for a direction, never a literal x, so a slide that feels
// natural in Arabic does not run backwards.
export function fromStart(distance: number): number {
  if (typeof document === "undefined") return distance;
  return document.documentElement.dir === "rtl" ? distance : -distance;
}
