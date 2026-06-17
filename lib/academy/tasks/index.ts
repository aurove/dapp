import { AcademyTaskNotFoundError } from "./errors";
import { runAcademyCheckIn } from "./check-in";
import type { AcademyCheckInState } from "../types";

export type AcademyTaskHandlerResult = AcademyCheckInState;
export type AcademyTaskCode = "check_in";

const academyTaskHandlers: Record<
  AcademyTaskCode,
  (userId: string) => Promise<AcademyTaskHandlerResult>
> = {
  check_in: runAcademyCheckIn,
};

export async function runAcademyTask(
  taskCode: AcademyTaskCode,
  userId: string,
): Promise<AcademyTaskHandlerResult> {
  const handler = academyTaskHandlers[taskCode];
  if (!handler) {
    throw new AcademyTaskNotFoundError(`Academy task "${taskCode}" is not configured.`);
  }

  return handler(userId);
}
