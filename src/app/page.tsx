"use client";

import Link from "next/link";
import {
  ArrowRight,
  Plus,
  Sparkles,
  Camera,
  Blocks,
  Heart,
  ChevronRight,
  Play,
} from "lucide-react";
import { MigrationNotice } from "@/components/migration-notice";
import { ModelThumbnail } from "@/components/model-thumbnail";
import { ModelViewer } from "@/components/model-viewer";
import { createModel } from "@/domain/models";
import { ActionLink } from "@/components/ui";
import { projectRepository, useProjects } from "@/services/project-repository";

export default function HomePage() {
  const { projects, active } = useProjects();
  const model = createModel(active.settings);
  const progress = active.completed
    ? 100
    : Math.round(((active.currentStep - 1) / model.steps.length) * 100);
  return (
    <div id="page-content" className="home-page">
      <MigrationNotice project={active} />
      <section className="home-hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="tiny-brick" /> A little more personal
          </span>
          <h1>
            Your world,
            <br />
            one <span>brick</span>
            <br className="desktop-break" /> at a time.
          </h1>
          <p>
            That place. That memory. That thing you love.
            <br className="desktop-break" /> Turn it into something you can
            build.
          </p>
          <ActionLink href="/create">
            Create new build <Plus size={18} />
          </ActionLink>
          <span className="hero-footnote">
            <Sparkles size={14} /> Four demo designs. Choose your next
            adventure.
          </span>
        </div>
        <div className="hero-model-card">
          <div className="hero-card-top">
            <span className="tag">
              <span /> Made of memories
            </span>
            <span className="edition-label">THE FIRST COLLECTION / 01</span>
          </div>
          <ModelViewer model={model} controls={false} className="hero-viewer" />
          <span className="floating-note">
            <span className="note-line" />
            Your world, in a whole
            <br />
            new light.
          </span>
          <div className="hero-card-bottom">
            <div>
              <span className="eyebrow">Your next little adventure</span>
              <h2>{active.name}</h2>
              <p>
                {model.stats.pieceCount} pieces <span>·</span>{" "}
                {model.stats.difficulty} <span>·</span>{" "}
                {model.design ? "Generated house" : "Demo design"}
              </p>
            </div>
            <Link
              href="/review"
              className="round-link"
              aria-label={`Explore ${active.name}`}
            >
              <ArrowRight size={22} />
            </Link>
          </div>
        </div>
      </section>
      <section className="how-it-works" aria-label="How BrickMade works">
        <div>
          <span className="how-icon">
            <Camera size={20} />
          </span>
          <div>
            <strong>Start with a photo</strong>
            <p>The things that mean something.</p>
          </div>
          <span className="how-number">01</span>
        </div>
        <div>
          <span className="how-icon">
            <Blocks size={20} />
          </span>
          <div>
            <strong>Make it BrickMade</strong>
            <p>A little model. A lot of character.</p>
          </div>
          <span className="how-number">02</span>
        </div>
        <div>
          <span className="how-icon">
            <Heart size={20} />
          </span>
          <div>
            <strong>Build a memory</strong>
            <p>One satisfying step at a time.</p>
          </div>
          <span className="how-number">03</span>
        </div>
      </section>
      <Link href="/models" className="collection-banner">
        <span>
          <small>THE DEMO COLLECTION</small>
          <strong>Four designs. A hundred ways to build.</strong>
          <em>House · rover · flowers · architecture</em>
        </span>
        <ArrowRight size={24} />
      </Link>
      <section className="builds-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">A collection that’s yours</span>
            <h2>
              My builds<span className="count-badge">{projects.length}</span>
            </h2>
          </div>
          <Link href="/create" className="text-link">
            Start something new <Plus size={16} />
          </Link>
        </div>
        <div className="builds-grid">
          {projects.map((project) => {
            const m = createModel(project.settings);
            const percent = project.completed
              ? 100
              : Math.round(((project.currentStep - 1) / m.steps.length) * 100);
            return (
              <Link
                href="/review"
                key={project.id}
                className="build-card"
                onClick={() => projectRepository.activate(project.id)}
              >
                <div className="build-thumbnail">
                  <ModelThumbnail model={m} name={project.name} />
                  <span
                    className={`status-pill ${project.completed ? "completed" : ""}`}
                  >
                    <span />
                    {project.completed
                      ? "Completed"
                      : project.currentStep > 1
                        ? "In progress"
                        : "Ready to explore"}
                  </span>
                </div>
                <div className="build-card-body">
                  <div>
                    <h3>{project.name}</h3>
                    <p>
                      {m.stats.pieceCount} pieces <span>·</span>{" "}
                      {m.stats.difficulty}
                    </p>
                  </div>
                  <ChevronRight size={20} />
                </div>
                {percent > 0 && (
                  <div className="mini-progress">
                    <span style={{ width: `${percent}%` }} />
                  </div>
                )}
              </Link>
            );
          })}
          <Link href="/create" className="new-build-card">
            <span className="new-build-icon">
              <Plus size={26} />
            </span>
            <h3>What will you build?</h3>
            <p>A favorite place is a lovely start.</p>
            <span className="text-link">
              Create a build <ArrowRight size={16} />
            </span>
          </Link>
        </div>
      </section>
      {active.currentStep > 1 && !active.completed && (
        <Link className="resume-banner" href="/builder">
          <span className="how-icon">
            <Play size={18} />
          </span>
          <div>
            <strong>Pick up where you left off</strong>
            <p>
              {active.name} · Step {active.currentStep} · {progress}% complete
            </p>
          </div>
          <ArrowRight size={20} />
        </Link>
      )}
      <div className="home-closing">
        <span className="small-star">✳</span>
        <p>
          Small bricks. <strong>Big memories.</strong>
        </p>
        <span>Turn anything into a brick build.</span>
      </div>
    </div>
  );
}
