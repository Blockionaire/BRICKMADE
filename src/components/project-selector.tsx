"use client";

import { useState } from "react";
import { ArrowUpRight, Check, Search, Plus, Layers } from "lucide-react";
import Link from "next/link";
import { BUILD_SIZES, DETAIL_LEVELS } from "@/domain/catalog";
import { createHouse } from "@/domain/house";
import { projectRepository, useProjects } from "@/services/project-repository";
import { ModelThumbnail } from "./model-thumbnail";
import { Sheet } from "./ui";

export function ProjectSelector() {
  const { projects, active } = useProjects();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(12);
  const filtered = projects.filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="project-switcher">
      <button
        className="active-build"
        aria-label="Choose a build"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <span className="active-build-thumbnail">
          <ModelThumbnail
            model={createHouse(active.settings)}
            name={active.name}
          />
        </span>
        <span>
          <small>YOUR CURRENT BUILD</small>
          <strong>{active.name}</strong>
        </span>
        <span className="switch-build-label">
          Switch build <ArrowUpRight size={15} />
        </span>
      </button>
      {open && (
        <Sheet
          title="Your builds"
          onClose={() => setOpen(false)}
          className="build-picker-sheet"
        >
          <p className="sheet-copy">
            Pick a project. Your place is saved in every build.
          </p>
          {projects.length > 4 && (
            <label className="search-input">
              <Search size={17} />
              <input
                aria-label="Search your builds"
                placeholder="Find your build…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(12);
                }}
              />
            </label>
          )}
          <div className="project-options">
            {filtered.slice(0, limit).map((project) => {
              const model = createHouse(project.settings);
              const mode = DETAIL_LEVELS.find(
                (d) => d.id === project.settings.detail,
              )?.name;
              return (
                <button
                  key={project.id}
                  className="project-option"
                  aria-pressed={project.id === active.id}
                  onClick={() => {
                    projectRepository.activate(project.id);
                    setOpen(false);
                  }}
                >
                  <span className="project-option-art">
                    <ModelThumbnail model={model} name={project.name} />
                  </span>
                  <span>
                    <strong>{project.name}</strong>
                    <small>
                      {mode} ·{" "}
                      {
                        BUILD_SIZES.find((s) => s.id === project.settings.size)
                          ?.name
                      }{" "}
                      · {model.stats.pieceCount} pieces
                    </small>
                    <em>
                      {project.completed
                        ? "Build complete"
                        : `Step ${project.currentStep} of ${model.steps.length}`}
                    </em>
                  </span>
                  {project.id === active.id ? (
                    <Check size={18} />
                  ) : (
                    <ArrowUpRight size={18} />
                  )}
                </button>
              );
            })}
          </div>
          {filtered.length === 0 && (
            <p className="sheet-copy">No builds match that name.</p>
          )}
          {filtered.length > limit && (
            <button
              className="button button-secondary full-width"
              onClick={() => setLimit((n) => n + 12)}
            >
              <Layers size={16} /> Show more builds
            </button>
          )}
          <Link href="/create" className="button button-primary full-width">
            <Plus size={17} /> Create new build
          </Link>
        </Sheet>
      )}
    </div>
  );
}
