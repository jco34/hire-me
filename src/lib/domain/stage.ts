import {
  STAGE_ORDER,
  TERMINAL_OUTCOMES,
  type Outcome,
  type Stage,
} from "@/lib/db/schema";

/**
 * Stage and outcome logic, kept pure so the stage strip can be rendered from a list row,
 * a detail row, a seed fixture or a test without any of them reaching for the database.
 */

export { STAGE_ORDER, TERMINAL_OUTCOMES };

/** Outcomes that end the application on a good note. Never struck through in the strip. */
const SUCCESSFUL_OUTCOMES: readonly Outcome[] = ["accepted"];

const STAGE_INDEX: ReadonlyMap<Stage, number> = new Map(
  STAGE_ORDER.map((stage, index) => [stage, index]),
);

const STAGE_LABELS: Record<Stage, string> = {
  saved: "saved",
  applied: "applied",
  screening: "screening",
  first_interview: "first interview",
  technical: "technical",
  behavioral: "behavioral",
  final: "final",
  offer: "offer",
};

const OUTCOME_LABELS: Record<Outcome, string> = {
  active: "active",
  rejected: "rejected",
  ghosted: "ghosted",
  withdrawn: "withdrawn",
  accepted: "accepted",
  declined: "declined",
};

/** Position of a stage in the progression. Drives every comparison below. */
export function stageIndex(stage: Stage): number {
  return STAGE_INDEX.get(stage) ?? 0;
}

export function stageLabel(stage: Stage): string {
  return STAGE_LABELS[stage];
}

export function outcomeLabel(outcome: Outcome): string {
  return OUTCOME_LABELS[outcome];
}

/** True when the application is no longer moving, whatever the reason. */
export function isTerminal(outcome: Outcome): boolean {
  return (TERMINAL_OUTCOMES as readonly Outcome[]).includes(outcome);
}

/* ---------------------------------------------------------------------------
 * Stage strip
 * ------------------------------------------------------------------------- */

export type StageCellState = "reached" | "current" | "unreached";

export type StageStripCell = {
  stage: Stage;
  index: number;
  state: StageCellState;
  /**
   * Set on the furthest stage the application ever reached when it ended badly. The
   * design contract strikes that cell rather than colouring it.
   */
  struck: boolean;
  /**
   * Set on the furthest reached cell when the application ended well. The design
   * contract doubles the weight of that cell instead of striking it.
   */
  emphasised: boolean;
};

/** The subset of an application the strip needs. Anything with these two fields works. */
export type StageStripSubject = {
  stage: Stage;
  outcome: Outcome;
};

/** The subset of an event the high-water mark needs. */
export type StageStripEvent = {
  fromStage?: Stage | null;
  toStage?: Stage | null;
};

/**
 * The stage strip for one application.
 *
 * "Reached" is the furthest point the application ever got to, which is not the same as
 * where it sits now: an application bumped back from `technical` to `screening` still
 * reached `technical`, and the strip should say so. When events are supplied the mark is
 * taken from the log, which is the only honest source. Without events the current stage
 * is the best available guess.
 */
export function stageStripCells(
  application: StageStripSubject,
  events?: readonly StageStripEvent[],
): StageStripCell[] {
  const currentIndex = stageIndex(application.stage);
  const highWaterIndex = highWaterStageIndex(application, events);
  const terminal = isTerminal(application.outcome);
  const succeeded = SUCCESSFUL_OUTCOMES.includes(application.outcome);

  return STAGE_ORDER.map((stage, index) => {
    let state: StageCellState;
    if (index === currentIndex) {
      state = "current";
    } else if (index <= highWaterIndex) {
      state = "reached";
    } else {
      state = "unreached";
    }

    const isFinalReached = index === highWaterIndex;

    return {
      stage,
      index,
      state,
      struck: terminal && !succeeded && isFinalReached,
      emphasised: terminal && succeeded && isFinalReached,
    };
  });
}

/** Furthest stage index the application is known to have reached. */
export function highWaterStageIndex(
  application: StageStripSubject,
  events?: readonly StageStripEvent[],
): number {
  let highWater = stageIndex(application.stage);

  if (!events) return highWater;

  for (const event of events) {
    for (const stage of [event.fromStage, event.toStage]) {
      if (!stage) continue;
      const index = stageIndex(stage);
      if (index > highWater) highWater = index;
    }
  }

  return highWater;
}

/* ---------------------------------------------------------------------------
 * Transitions
 * ------------------------------------------------------------------------- */

/**
 * Legal forward moves from a stage.
 *
 * Every later stage is offered, not just the adjacent one, because real processes skip:
 * a screening call can go straight to a final, and forcing the user to log fictional
 * intermediate stages would corrupt the event log to satisfy a rule nobody asked for.
 */
export function nextStages(current: Stage): Stage[] {
  const currentIndex = stageIndex(current);
  return STAGE_ORDER.filter((_, index) => index > currentIndex);
}

/** Stages behind the current one. Only reachable through an explicit backward move. */
export function previousStages(current: Stage): Stage[] {
  const currentIndex = stageIndex(current);
  return STAGE_ORDER.filter((_, index) => index < currentIndex);
}

export function isForwardTransition(from: Stage, to: Stage): boolean {
  return stageIndex(to) > stageIndex(from);
}

/**
 * Backward moves are possible but never accidental, so they require `allowBackward`.
 * A move to the same stage is refused either way: there is nothing to record.
 */
export function canChangeStage(
  from: Stage,
  to: Stage,
  options: { allowBackward?: boolean } = {},
): boolean {
  if (from === to) return false;
  if (isForwardTransition(from, to)) return true;
  return options.allowBackward === true;
}
