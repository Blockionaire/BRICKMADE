"use client";

import { useState } from "react";
import {
  UserRound,
  ShieldCheck,
  FolderHeart,
  Trash2,
  RotateCcw,
  ArrowRight,
  Info,
} from "lucide-react";
import Link from "next/link";
import { PageHeading, Sheet } from "@/components/ui";
import { projectRepository, useProjects } from "@/services/project-repository";
import { AiConnectionPanel } from "@/components/ai-connection";

export default function AccountPage() {
  const { projects } = useProjects();
  const [action, setAction] = useState<{
    type: "delete" | "reset";
    id?: string;
    name?: string;
  } | null>(null);
  return (
    <div id="page-content" className="account-page">
      <PageHeading
        eyebrow="A little space of your own"
        title="Hello, maker."
        description="Your private testing space. No sign-up needed."
      />
      <div className="account-layout">
        <div className="profile-panel panel">
          <span className="profile-avatar">
            <UserRound size={32} strokeWidth={1.5} />
          </span>
          <h2>Guest maker</h2>
          <span className="tag">Private prototype</span>
          <p>
            Your saved designs
            <br />
            stay in this browser.
          </p>
          <div>
            <FolderHeart size={18} />
            <strong>{projects.length}</strong>{" "}
            {projects.length === 1 ? "build" : "builds"} in your collection
          </div>
          <Link className="button button-primary" href="/create">
            Make something new <ArrowRight size={17} />
          </Link>
        </div>
        <div>
          <section className="panel account-section">
            <div className="account-section-heading">
              <ShieldCheck size={22} />
              <h2>Your photos. Your privacy.</h2>
            </div>
            <p>
              Photos you select stay in memory for the current browser session.
              Demo generation keeps them local. Optional photo interpretation
              sends up to three resized photos to your connected private service
              and OpenAI only after you confirm sharing. BrickMade does not
              store those images; OpenAI’s applicable data retention policy
              still applies.
            </p>
            <p>
              Build names, edited house descriptions, and building progress are
              saved locally in this browser. They do not sync across devices. If
              browser storage is unavailable, progress lasts for this session
              only.
            </p>
          </section>
          <section className="panel account-section">
            <AiConnectionPanel />
          </section>
          <section className="panel account-section">
            <div className="account-section-heading">
              <FolderHeart size={22} />
              <h2>Your collection</h2>
            </div>
            <div className="account-builds">
              {projects.map((project) => (
                <div key={project.id}>
                  <Link
                    href="/review"
                    onClick={() => projectRepository.activate(project.id)}
                  >
                    <strong>{project.name}</strong>
                    <small>
                      {project.completed
                        ? "Completed"
                        : `Step ${project.currentStep}`}{" "}
                      · {project.settings.detail}
                    </small>
                  </Link>
                  <button
                    className="icon-button"
                    aria-label={`Delete ${project.name}`}
                    onClick={() =>
                      setAction({
                        type: "delete",
                        id: project.id,
                        name: project.name,
                      })
                    }
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </div>
            <button
              className="text-link danger"
              onClick={() => setAction({ type: "reset" })}
            >
              <RotateCcw size={15} /> Reset this demo
            </button>
          </section>
          <div className="account-note">
            <Info size={17} />
            <p>
              This is a private product prototype. House generation uses real
              part placements and independent digital checks. Photo
              interpretation needs a connected private service. Assistant
              responses remain deterministic demonstrations. BrickMade is
              independent and is not affiliated with LEGO.
            </p>
          </div>
        </div>
      </div>
      {action && (
        <Sheet
          title={
            action.type === "reset" ? "A fresh start?" : "Remove this build?"
          }
          onClose={() => setAction(null)}
        >
          <p className="sheet-copy">
            {action.type === "reset"
              ? "This removes your local builds and progress and restores the original Compact House demo."
              : `This removes ${action.name} and its progress from this browser. If it is your last build, the original demo will be restored.`}
          </p>
          <div className="sheet-actions">
            <button
              className="button button-secondary"
              onClick={() => setAction(null)}
            >
              Keep my builds
            </button>
            <button
              className="button button-primary"
              onClick={() => {
                if (action.type === "reset") projectRepository.reset();
                else projectRepository.remove(action.id!);
                setAction(null);
              }}
            >
              {action.type === "reset" ? "Reset demo" : "Remove build"}
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
