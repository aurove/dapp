export class AcademyTaskNotFoundError extends Error {
  code = "ACADEMY_TASK_NOT_FOUND";
  status = 404;

  constructor(message: string) {
    super(message);
    this.name = "AcademyTaskNotFoundError";
  }
}

export class AcademyActivityUserNotFoundError extends Error {
  code = "ACADEMY_ACTIVITY_USER_NOT_FOUND";
  status = 404;

  constructor(message: string) {
    super(message);
    this.name = "AcademyActivityUserNotFoundError";
  }
}
