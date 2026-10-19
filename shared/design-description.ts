import {
  parseHouseDesign,
  type HouseDesign,
  type StudioCategory,
} from "./studio";
import { parseSubjectDesign, type SubjectDesign } from "./subject-design";
import {
  isSculptDesign,
  parseSculptDesign,
  type SculptDesign,
} from "./sculpt-design";
export type DesignDescription = HouseDesign | SubjectDesign | SculptDesign;
export function parseDesignDescription(
  value: unknown,
  category: StudioCategory,
): DesignDescription {
  if (isSculptDesign(value)) return parseSculptDesign(value, category);
  return category === "house"
    ? parseHouseDesign(value)
    : parseSubjectDesign(value, category);
}
/** Module version of the legacy (version 1/2) template compilers. */
export const moduleVersionFor = (category: StudioCategory) =>
  category === "house" ? "house-2026-10-15.v2" : `${category}-2026-10-16.v1`;
/** Module version of the sculpture pipeline that carves photo-derived reference views. */
export const sculptModuleVersion = (category: StudioCategory) =>
  `sculpt-${category}-2026-10-18.v3`;
/** The module that produced (and must recompile) a stored description. */
export const describedModuleVersion = (
  description: unknown,
  category: StudioCategory,
) =>
  isSculptDesign(description)
    ? sculptModuleVersion(category)
    : moduleVersionFor(category);
