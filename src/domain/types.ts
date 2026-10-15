import type { HouseBrief } from "../../shared/house-brief";
import type { HouseDesign } from "../../shared/studio";
import type { StudioArtifact } from "../../shared/studio-artifact";
export type DetailLevel = "easy" | "normal" | "hard";
export type BuildDifficulty = "easy" | "medium" | "hard";
export type CameraView =
  "perspective" | "front" | "back" | "side" | "left" | "top";
export type PlacementMode = "assembled" | "guide";
export type BuildSize = "compact" | "standard" | "large";
export type ModelKind = "house" | "rover" | "plant" | "pavilion";
export type ColorId =
  | "sand"
  | "roof"
  | "glass"
  | "wood"
  | "grass"
  | "stone"
  | "leaf"
  | "flower"
  | "black"
  | "white";
export type Category =
  | "Brick"
  | "Plate"
  | "Tile"
  | "Slope"
  | "Arch"
  | "Panel"
  | "Wedge"
  | "Plant"
  | "Window"
  | "Technic"
  | "Other";

export interface GenerationSettings {
  detail: DetailLevel;
  size: BuildSize;
  buildDifficulty?: BuildDifficulty;
  modelKind?: ModelKind;
  houseBrief?: HouseBrief;
  houseDesign?: HouseDesign;
  designSource?: "manual" | "openai";
}

export interface CatalogPart {
  id: string;
  name: string;
  category: Category;
  width: number;
  depth: number;
  height: number;
  studs: boolean;
  geometryId?: string;
}

export interface Placement {
  id: string;
  partId: string;
  color: ColorId;
  position: [number, number, number];
  rotated: boolean;
  rotation?: [number, number, number, number];
  layer?: number;
  approach?: [number, number, number];
  dependsOn?: string[];
  procedure?: "manual-flex";
  step: number;
}

export interface PartQuantity {
  key: string;
  partId: string;
  color: ColorId;
  quantity: number;
}

export interface BuildStep {
  number: number;
  title: string;
  description: string;
  hint: string;
  bag: number;
  parts: PartQuantity[];
  placementIds: string[];
  phaseNumber: number;
  cluster: number;
  clusters: number;
  area: string;
  suggestedView: CameraView;
  focus: [number, number, number];
  insertionDirection?: [number, number, number];
  procedures?: string[];
}

export type BuildPhase = Omit<
  BuildStep,
  "phaseNumber" | "cluster" | "clusters" | "area" | "suggestedView" | "focus"
> & { area?: string; suggestedView?: CameraView };

export interface SortingGroup {
  number: number;
  name: string;
  firstStep: number;
  lastStep: number;
  parts: PartQuantity[];
}

export interface HouseModel {
  constructionPhases?: BuildPhase[];
  studio?: {
    moduleVersion: string;
    description: HouseDesign;
    adaptations: string[];
    footprintStuds: [number, number];
    windowCounts: [number, number, number, number];
    storeys: number;
    roofShape: string;
  };
  kind?: ModelKind;
  revision?: string;
  design?: {
    source: "manual" | "openai";
    brief: HouseBrief;
    adaptations: string[];
  };
  settings: GenerationSettings;
  placements: Placement[];
  steps: BuildStep[];
  parts: PartQuantity[];
  bags: SortingGroup[];
  stats: {
    pieceCount: number;
    uniquePartCount: number;
    dimensions: [number, number, number];
    buildMinutes: number;
    difficulty: "Easy" | "Moderate" | "Challenging";
  };
}

export interface Project {
  artifact?: StudioArtifact;
  cloud?: {
    ownerId?: string;
    projectId: string;
    jobId: string;
    sha256: string;
    progressVersion?: number;
    progressSignature?: string;
  };
  id: string;
  name: string;
  createdAt: string;
  settings: GenerationSettings;
  currentStep: number;
  completed: boolean;
  modelRevision?: string;
  /** Retain the exact completed pieces when regrouping instructions mid-build. */
  completedPlacementIds?: string[];
  migrationNotice?: "structure-updated" | "house-generator-updated";
}

export interface AssistantContext {
  projectName: string;
  step: BuildStep;
  nextStep?: BuildStep;
  bag: SortingGroup;
}

export interface AssistantResponse {
  text: string;
  action?: "top-view" | "highlight";
}

export interface GenerationProvider {
  generate(
    settings: GenerationSettings,
    onStage: (stage: number) => void,
    signal: AbortSignal,
  ): Promise<HouseModel>;
}

export interface BuildAssistantProvider {
  answer(question: string, context: AssistantContext): AssistantResponse;
}
