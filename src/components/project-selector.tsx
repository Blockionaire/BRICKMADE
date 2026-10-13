"use client";

import { BUILD_SIZES, DETAIL_LEVELS } from "@/domain/catalog";
import { projectRepository, useProjects } from "@/services/project-repository";

export function ProjectSelector() {
  const { projects, activeId } = useProjects();
  return (
    <label className="project-selector">
      <span>Choose a build</span>
      <select
        aria-label="Choose a build"
        value={activeId}
        onChange={(event) => projectRepository.activate(event.target.value)}
      >
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name} ·{" "}
            {DETAIL_LEVELS.find((d) => d.id === project.settings.detail)?.name}{" "}
            · {BUILD_SIZES.find((s) => s.id === project.settings.size)?.name}
          </option>
        ))}
      </select>
    </label>
  );
}
