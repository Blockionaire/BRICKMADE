"use client";
import { Info, X } from "lucide-react";
import { projectRepository } from "@/services/project-repository";
import type { Project } from "@/domain/types";
export function MigrationNotice({ project }: { project: Project }) {
  if (!project.migrationNotice) return null;
  return (
    <div className="migration-notice" role="status">
      <Info size={18} />
      <p>
        <strong>Your design has been rebuilt.</strong>{" "}
        {project.migrationNotice === "house-generator-updated"
          ? "The house generator changed, so we regenerated the saved description."
          : "We corrected its structure and instructions."}{" "}
        Your name and settings are kept; building progress starts fresh for the
        new assembly. The previous save was retained locally where browser
        storage permits.
      </p>
      <button
        aria-label="Dismiss design update"
        onClick={() =>
          projectRepository.save({ ...project, migrationNotice: undefined })
        }
      >
        <X size={15} />
      </button>
    </div>
  );
}
