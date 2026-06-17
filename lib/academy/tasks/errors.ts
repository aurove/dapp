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

export class AcademyReferralError extends Error {
  status = 400;
  code = "ACADEMY_REFERRAL_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "AcademyReferralError";
  }
}

export class AcademyReferralNotFoundError extends Error {
  status = 404;
  code = "ACADEMY_REFERRAL_NOT_FOUND";

  constructor(message: string) {
    super(message);
    this.name = "AcademyReferralNotFoundError";
  }
}

export class AcademyReferralAlreadyBoundError extends Error {
  status = 409;
  code = "ACADEMY_REFERRAL_ALREADY_BOUND";

  constructor(message: string) {
    super(message);
    this.name = "AcademyReferralAlreadyBoundError";
  }
}
