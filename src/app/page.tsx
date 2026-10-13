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
import { ModelViewer } from "@/components/model-viewer";
import { createHouse } from "@/domain/house";
import { ActionLink } from "@/components/ui";
import { projectRepository, useProjects } from "@/services/project-repository";

export default function HomePage() {
  const { projects, active } = useProjects();
  const model = createHouse(active.settings);
  const progress = active.completed
    ? 100
    : Math.round(((active.currentStep - 1) / model.steps.length) * 100);
  return (
    <div id="page-content" className="home-page">
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
            <Sparkles size={14} /> Start with our house demo. Make it yours.
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
            Home, in a whole
            <br />
            new light.
          </span>
          <div className="hero-card-bottom">
            <div>
              <span className="eyebrow">Your next little adventure</span>
              <h2>{active.name}</h2>
              <p>
                {model.stats.pieceCount} pieces <span>·</span>{" "}
                {model.stats.difficulty} <span>·</span> Demo design
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
            const m = createHouse(project.settings);
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
                  <HouseThumbnail />
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

export function HouseThumbnail() {
  return (
    <svg viewBox="0 0 400 250" aria-hidden="true">
      <ellipse
        cx="206"
        cy="201"
        rx="115"
        ry="18"
        fill="#807561"
        opacity=".08"
      />
      <path d="m87 178 126 29 91-51-126-29Z" fill="#adb48b" />
      <path d="m127 155 79 18v-69l-79-18Z" fill="#dfcaa3" />
      <path d="m206 173 64-37V67l-64 37Z" fill="#baa682" />
      <path d="m114 88 62-39 108 20-76 45Z" fill="#ba5b43" />
      <path d="m114 88 94 26-25-57-7-8Z" fill="#a84c38" />
      <path d="m232 74 16 4V49l-16-4Z" fill="#6b4834" />
      <path d="m164 164 19 4v-35l-19-4Z" fill="#74513e" />
      <path
        d="m138 119 15 3v19l-15-3Zm45 10 15 3v19l-15-3Zm38-15 15-9v19l-15 9Z"
        fill="#719ba3"
      />
      <path d="m164 171 19 4-18 11-18-4Z" fill="#d4d0c5" />
      <g fill="#627b51">
        <rect x="109" y="155" width="18" height="18" rx="3" />
        <rect x="252" y="159" width="18" height="18" rx="3" />
      </g>
      <g fill="#e4b757">
        <circle cx="115" cy="155" r="3" />
        <circle cx="262" cy="159" r="3" />
      </g>
    </svg>
  );
}
