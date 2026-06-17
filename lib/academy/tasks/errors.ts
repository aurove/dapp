export class AcademyTaskNotFoundError extends Error {
  code = "ACADEMY_TASK_NOT_FOUND";
  status = 404;

  constructor(message: string) {
    super(message);
    this.name = "AcademyTaskNotFoundError";
  }
}
