"use client";
import { useState } from "react";
import { Download, ClipboardCheck, ExternalLink } from "lucide-react";
import type { Project } from "@/domain/types";
import { projectModel } from "@/domain/project-model";
import {
  prepareBuildHandoff,
  physicalTestPack,
} from "@/domain/library/build-handoff";
import { Sheet } from "./ui";

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function BuildHandoff({ project }: { project: Project }) {
  const [open, setOpen] = useState(false),
    handoff = prepareBuildHandoff(projectModel(project));
  return (
    <>
      <div className="build-handoff-actions">
        <button
          className="button button-secondary"
          onClick={() =>
            download(
              "brickmade-parts.csv",
              handoff.csv,
              "text/csv;charset=utf-8",
            )
          }
        >
          <Download size={17} />
          Save full parts list
        </button>
        <button
          className="button button-secondary"
          onClick={() => setOpen(true)}
        >
          <ExternalLink size={17} />
          Find my pieces
        </button>
        <button
          className="text-link"
          onClick={() =>
            download(
              "brickmade-physical-test-pack.json",
              JSON.stringify(physicalTestPack(project), null, 2),
              "application/json",
            )
          }
        >
          <ClipboardCheck size={17} />
          Physical test pack
        </button>
      </div>
      {open && (
        <Sheet
          title="From your build to real pieces"
          onClose={() => setOpen(false)}
        >
          <p className="sheet-copy">
            Your complete list contains {handoff.totalPieces.toLocaleString()}{" "}
            pieces. The CSV keeps exact source IDs, colors and quantities.
          </p>
          {handoff.xml ? (
            <button
              className="button button-primary"
              onClick={() =>
                download(
                  "brickmade-wanted-list.xml",
                  handoff.xml!,
                  "application/xml",
                )
              }
            >
              <Download size={17} />
              Download BrickLink list
            </button>
          ) : (
            <p className="sheet-copy">
              Marketplace IDs still need verification for{" "}
              {handoff.readiness.missing.length} part and color combinations. A
              complete marketplace import will become available when every
              identity is checked.
            </p>
          )}
          <button
            className="button button-secondary"
            onClick={() =>
              download(
                "brickmade-mapping-review.json",
                JSON.stringify(
                  {
                    version: 1,
                    lines: handoff.lines.map((l) => ({
                      ldrawId: l.ldrawId,
                      rebrickablePartId: l.rebrickablePartId,
                      rebrickableColorId: l.rebrickableColorId,
                      quantity: l.quantity,
                      mappingStatus: l.mappingStatus,
                    })),
                    missing: handoff.readiness.missing,
                  },
                  null,
                  2,
                ),
                "application/json",
              )
            }
          >
            <Download size={17} />
            Save mapping report
          </button>
          <p className="sheet-copy">
            Explore{" "}
            <a
              href="https://www.bricklink.com/"
              target="_blank"
              rel="noreferrer"
            >
              BrickLink
            </a>
            ,{" "}
            <a
              href="https://www.brickowl.com/"
              target="_blank"
              rel="noreferrer"
            >
              BrickOwl
            </a>{" "}
            or{" "}
            <a
              href="https://www.lego.com/pick-and-build/pick-a-brick"
              target="_blank"
              rel="noreferrer"
            >
              LEGO Pick a Brick
            </a>
            . Check exact identities, local availability and quantities there.
            Opening these links sends no project or photo data.
          </p>
        </Sheet>
      )}
    </>
  );
}
