import {
  parseHouseDesign,
  type HouseDesign,
  type StudioCategory,
} from "./studio";
import { parseSubjectDesign, type SubjectDesign } from "./subject-design";
export type DesignDescription = HouseDesign | SubjectDesign;
export function parseDesignDescription(
  value: unknown,
  category: StudioCategory,
): DesignDescription {
  return category === "house"
    ? parseHouseDesign(value)
    : parseSubjectDesign(value, category);
}
export const moduleVersionFor = (category: StudioCategory) =>
  category === "house" ? "house-2026-10-15.v2" : `${category}-2026-10-16.v1`;
