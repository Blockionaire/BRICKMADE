"use client";

import { useSyncExternalStore } from "react";
import { createHouse, createLegacyInstructionModel } from "@/domain/house";
import { regroupProject } from "@/domain/instruction-progress";
import { DEFAULT_SETTINGS } from "@/domain/catalog";
import type { Project } from "@/domain/types";

interface SavedState {
  version: 4;
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
  version: 4,
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
  return (
    typeof p.id === "string" &&
    typeof p.name === "string" &&
    p.name.length > 0 &&
    p.name.length <= 60 &&
    typeof p.createdAt === "string" &&
    !!p.settings &&
    ["easy", "normal", "hard", "standard", "high", "collector"].includes(
      p.settings.detail,
    ) &&
    ["compact", "standard", "large"].includes(p.settings.size) &&
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
      ![1, 2, 3, 4].includes(state.version) ||
      !Array.isArray(state.projects) ||
      !state.projects.length ||
      state.projects.length > 100 ||
      !state.projects.every(validProject) ||
      !state.projects.some((p: Project) => p.id === state.activeId)
    )
      return INITIAL;
    const projects: Project[] = state.projects.map((p: Project) => {
      const detail = String(p.settings.detail);
      const settings = {
        ...p.settings,
        buildDifficulty: p.settings.buildDifficulty ?? "medium",
        detail:
          detail === "standard"
            ? "normal"
            : ["high", "collector"].includes(detail)
              ? "hard"
              : detail,
      } as Project["settings"];
      if (!["easy", "normal", "hard"].includes(settings.detail))
        throw new Error("Invalid detail");
      const model = createHouse(settings);
      if (state.version === 3) {
        const previous = createLegacyInstructionModel(settings);
        return regroupProject(
          {
            ...p,
            settings,
            currentStep: Math.min(p.currentStep, previous.steps.length),
            completedPlacementIds: undefined,
          },
          settings.buildDifficulty!,
          previous,
        );
      }
      const currentStep =
        state.version === 1
          ? 1
          : p.completed
            ? model.steps.length
            : state.version === 2
              ? (model.steps.find((step) => step.phaseNumber >= p.currentStep)
                  ?.number ?? model.steps.length)
              : Math.min(p.currentStep, model.steps.length);
      const validIds = new Set(model.placements.map((piece) => piece.id));
      return {
        ...p,
        settings,
        currentStep,
        completed: state.version === 1 ? false : p.completed,
        completedPlacementIds:
          state.version < 4
            ? undefined
            : p.completedPlacementIds?.filter((id) => validIds.has(id)),
      };
    });
    return { version: 4, activeId: state.activeId, projects };
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
  save(project: Project) {
    const current = getSnapshot();
    const others = current.projects.filter((p) => p.id !== project.id);
    write({
      version: 4,
      projects: [project, ...others].slice(0, 100),
      activeId: project.id,
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
            version: 4,
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
