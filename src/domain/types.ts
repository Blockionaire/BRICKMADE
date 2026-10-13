export type DetailLevel = "easy" | "normal" | "hard";
export type CameraView =
  "perspective" | "front" | "back" | "side" | "left" | "top";
export type PlacementMode = "assembled" | "guide";
export type BuildSize = "compact" | "standard" | "large";
export type ColorId =
  "sand" | "roof" | "glass" | "wood" | "grass" | "stone" | "leaf" | "flower";
export type Category = "Brick" | "Plate" | "Tile";

export interface GenerationSettings {
  detail: DetailLevel;
  size: BuildSize;
}

export interface CatalogPart {
  id: string;
  name: string;
  category: Category;
  width: number;
  depth: number;
  height: number;
  studs: boolean;
}

export interface Placement {
  id: string;
  partId: string;
  color: ColorId;
  position: [number, number, number];
  rotated: boolean;
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
}

export type BuildPhase = Omit<
  BuildStep,
  "phaseNumber" | "cluster" | "clusters" | "area" | "suggestedView" | "focus"
>;

export interface SortingGroup {
  number: number;
  name: string;
  firstStep: number;
  lastStep: number;
  parts: PartQuantity[];
}

export interface HouseModel {
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
  id: string;
  name: string;
  createdAt: string;
  settings: GenerationSettings;
  currentStep: number;
  completed: boolean;
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
