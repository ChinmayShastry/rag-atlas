"use client";

import { STAGE_META, stageKicker } from "../lib/ragTypes";
import type { StageProps } from "../lib/ragTypes";
import { StepSection } from "./ui";

/**
 * Stands in for a stage whose flow is still being built, so the architecture
 * switcher can be used and reviewed before every type is finished.
 */
export default function StagePlaceholder({
  n,
  id,
}: StageProps & { id: string }) {
  return (
    <StepSection
      id={id}
      n={n}
      kicker={stageKicker(n)}
      title={STAGE_META[id]?.short ?? id}
      lede="This stage is still being built."
      locked
      lockNote="Not implemented yet — the architecture switcher is wired up, and this flow is next in the queue."
    >
      <div />
    </StepSection>
  );
}
