export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class BadRequestError extends HttpError {
  constructor(message: string, code = "bad_request") {
    super(400, code, message);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = "Ressource introuvable", code = "not_found") {
    super(404, code, message);
  }
}

export class CapacityFullError extends HttpError {
  constructor(message = "Plus de place sur ce créneau") {
    super(409, "capacity_full", message);
  }
}
