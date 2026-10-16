"use client";

import { useSyncExternalStore } from "react";
import { createModel } from "@/domain/models";
import { DEFAULT_SETTINGS } from "@/domain/catalog";
import { parseHouseBrief } from "../../shared/house-brief";
import { parseHouseDesign } from "../../shared/studio";
import { parseStudioArtifact } from "../../shared/studio-artifact";
import { projectModel } from "@/domain/project-model";
import type { Project } from "@/domain/types";

interface SavedState {
  version: 5;
  projects: Project[];
  activeId: string;
}
export const DEMO_PROJECT: Project = {
  id: "compact-house",
  name: "Compact House",
  createdAt: "2026-10-13T00:00:00Z",
  settings: DEFAULT_SETTINGS,
  currentStep: 1,
  completed: false,
};
const INITIAL: SavedState = {
  version: 5,
  projects: [DEMO_PROJECT],
  activeId: DEMO_PROJECT.id,
};
const STORAGE_KEY = "brickmade.private-demo.v1";
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedState = INITIAL;
let memoryState: SavedState | null = null;

function validProject(value: unknown): value is Project {
  if (!value || typeof value !== "object") return false;
  const p = value as Project;
  try {
    if (p.settings?.houseDesign) parseHouseDesign(p.settings.houseDesign);
    if (p.artifact) {
      parseStudioArtifact(p.artifact);
      if (
        p.settings.detail !== p.artifact.options.detail ||
        p.settings.size !== p.artifact.options.size
      )
        return false;
    }
    if (
      p.cloud &&
      (!p.artifact ||
        typeof p.cloud.projectId !== "string" ||
        p.cloud.projectId !== p.artifact.projectId ||
        p.cloud.jobId !== p.artifact.jobId ||
        typeof p.cloud.jobId !== "string" ||
        !/^[a-f0-9]{64}$/.test(p.cloud.sha256))
    )
      return false;
  } catch {
    return false;
  }
  if (p.settings?.houseBrief !== undefined) {
    try {
      if (
        parseHouseBrief(p.settings.houseBrief).subject !== "house" ||
        (p.settings.modelKind && p.settings.modelKind !== "house")
      )
        return false;
    } catch {
      return false;
    }
  }
  return (
    typeof p.id === "string" &&
    typeof p.name === "string" &&
    p.name.length > 0 &&
    p.name.length <= 60 &&
    typeof p.createdAt === "string" &&
    (p.modelRevision === undefined ||
      (typeof p.modelRevision === "string" && p.modelRevision.length <= 100)) &&
    !!p.settings &&
    (p.settings.designSource === undefined ||
      ["manual", "openai"].includes(p.settings.designSource)) &&
    ["easy", "normal", "hard", "standard", "high", "collector"].includes(
      p.settings.detail,
    ) &&
    ["compact", "standard", "large"].includes(p.settings.size) &&
    (p.settings.modelKind === undefined ||
      ["house", "rover", "plant", "pavilion", "animal", "sculpture"].includes(
        p.settings.modelKind,
      )) &&
    (p.settings.buildDifficulty === undefined ||
      ["easy", "medium", "hard"].includes(p.settings.buildDifficulty)) &&
    (p.completedPlacementIds === undefined ||
      (Array.isArray(p.completedPlacementIds) &&
        p.completedPlacementIds.length <= 10000 &&
        p.completedPlacementIds.every((id) => typeof id === "string"))) &&
    Number.isInteger(p.currentStep) &&
    p.currentStep >= 1 &&
    p.currentStep <= 10000 &&
    typeof p.completed === "boolean"
  );
}

export function parseSavedState(raw: string | null): SavedState {
  if (!raw) return INITIAL;
  try {
    const state = JSON.parse(raw);
    if (
      ![1, 2, 3, 4, 5].includes(state.version) ||
      !Array.isArray(state.projects) ||
      !state.projects.length ||
      state.projects.length > 100 ||
      !state.projects.every(validProject) ||
      new Set(state.projects.map((p: Project) => p.id)).size !==
        state.projects.length ||
      !state.projects.some((p: Project) => p.id === state.activeId)
    )
      return INITIAL;
    const projects: Project[] = state.projects.map((p: Project) => {
      const detail = String(p.settings.detail);
      const settings = {
        ...p.settings,
        buildDifficulty: p.settings.buildDifficulty ?? "medium",
        modelKind: p.settings.modelKind ?? "house",
        detail:
          detail === "standard"
            ? "normal"
            : ["high", "collector"].includes(detail)
              ? "hard"
              : detail,
      } as Project["settings"];
      if (!["easy", "normal", "hard"].includes(settings.detail))
        throw new Error("Invalid detail");
      const model = projectModel({ ...p, settings });
      if (state.version < 5)
        return {
          ...p,
          settings,
          currentStep: 1,
          completed: false,
          completedPlacementIds: undefined,
          migrationNotice: "structure-updated",
        };
      if (
        !p.artifact &&
        settings.houseBrief &&
        p.modelRevision &&
        p.modelRevision !== model.revision
      )
        return {
          ...p,
          settings,
          modelRevision: model.revision,
          currentStep: 1,
          completed: false,
          completedPlacementIds: undefined,
          migrationNotice: "house-generator-updated",
        };
      const currentStep = p.completed
        ? model.steps.length
        : Math.min(p.currentStep, model.steps.length);
      const validIds = new Set(model.placements.map((piece) => piece.id));
      return {
        ...p,
        settings,
        ...(settings.houseBrief ? { modelRevision: model.revision } : {}),
        currentStep,
        completed: p.completed,
        completedPlacementIds: p.completedPlacementIds?.filter((id) =>
          validIds.has(id),
        ),
      };
    });
    return { version: 5, activeId: state.activeId, projects };
  } catch {
    return INITIAL;
  }
}

function getSnapshot() {
  if (memoryState) return memoryState;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      cachedState = parseSavedState(raw);
      if (raw && cachedState.projects.some((p) => p.migrationNotice)) {
        const parsed = JSON.parse(raw);
        const recompiled = parsed.projects.some(
          (p: Project) =>
            p.settings.houseBrief &&
            p.modelRevision &&
            cachedState.projects.find((next) => next.id === p.id)
              ?.modelRevision !== p.modelRevision,
        );
        if (parsed.version < 5 || recompiled) {
          const backupKey = `${STORAGE_KEY}.${parsed.version < 5 ? "before-structure-v2" : "before-house-generator-update"}`;
          if (!localStorage.getItem(backupKey))
            localStorage.setItem(backupKey, raw);
          cachedRaw = JSON.stringify(cachedState);
          localStorage.setItem(STORAGE_KEY, cachedRaw);
        }
      }
    }
    return cachedState;
  } catch {
    return cachedState;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function write(state: SavedState) {
  cachedState = state;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    cachedRaw = JSON.stringify(state);
    memoryState = null;
  } catch {
    memoryState = state;
  }
  for (const listener of listeners) listener();
}

export const projectRepository = {
  snapshot: getSnapshot,
  save(project: Project, activate = true) {
    if (project.artifact || project.settings.houseBrief)
      project = {
        ...project,
        modelRevision:
          project.artifact?.compilerVersion ||
          createModel(project.settings).revision,
      };
    const current = getSnapshot();
    const others = current.projects.filter((p) => p.id !== project.id);
    write({
      version: 5,
      projects: [project, ...others].slice(0, 100),
      activeId: activate ? project.id : current.activeId,
    });
  },
  activate(id: string) {
    const state = getSnapshot();
    if (state.projects.some((p) => p.id === id))
      write({ ...state, activeId: id });
  },
  remove(id: string) {
    const state = getSnapshot();
    const projects = state.projects.filter((p) => p.id !== id);
    write(
      projects.length
        ? {
            version: 5,
            projects,
            activeId: projects.some((p) => p.id === state.activeId)
              ? state.activeId
              : projects[0].id,
          }
        : INITIAL,
    );
  },
  clearCloudCopies() {
    const state = getSnapshot();
    const projects = state.projects.filter((p) => !p.cloud);
    write(
      projects.length
        ? {
            version: 5,
            projects,
            activeId: projects.some((p) => p.id === state.activeId)
              ? state.activeId
              : projects[0].id,
          }
        : INITIAL,
    );
  },
  reset() {
    write(INITIAL);
  },
};

export function useProjects() {
  const state = useSyncExternalStore(subscribe, getSnapshot, () => INITIAL);
  return {
    ...state,
    active: state.projects.find((p) => p.id === state.activeId) ?? DEMO_PROJECT,
  };
}
