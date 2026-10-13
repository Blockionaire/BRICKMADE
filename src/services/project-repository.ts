"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_SETTINGS } from "@/domain/catalog";
import type { Project } from "@/domain/types";

interface SavedState {
  version: 2;
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
  version: 2,
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
    Number.isInteger(p.currentStep) &&
    p.currentStep >= 1 &&
    p.currentStep <= 100 &&
    typeof p.completed === "boolean"
  );
}

export function parseSavedState(raw: string | null): SavedState {
  if (!raw) return INITIAL;
  try {
    const state = JSON.parse(raw);
    if (
      (state.version !== 1 && state.version !== 2) ||
      !Array.isArray(state.projects) ||
      !state.projects.length ||
      state.projects.length > 100 ||
      !state.projects.every(validProject) ||
      !state.projects.some((p: Project) => p.id === state.activeId)
    )
      return INITIAL;
    if (state.version === 1) {
      // Designs changed, so old step numbers must not claim progress in a new design.
      return {
        ...state,
        version: 2,
        projects: state.projects.map(
          (
            p: Omit<Project, "settings"> & {
              settings: { detail: string; size: Project["settings"]["size"] };
            },
          ) => ({
            ...p,
            settings: {
              ...p.settings,
              detail:
                p.settings.detail === "standard"
                  ? "normal"
                  : ["high", "collector"].includes(p.settings.detail)
                    ? "hard"
                    : p.settings.detail,
            },
            currentStep: 1,
            completed: false,
          }),
        ),
      };
    }
    if (
      state.projects.some(
        (p: Project) => !["easy", "normal", "hard"].includes(p.settings.detail),
      )
    )
      return INITIAL;
    return state;
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
      version: 2,
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
            version: 2,
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
