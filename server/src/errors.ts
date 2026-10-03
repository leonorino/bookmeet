export interface ErrorDetail {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function invalidRequest(message: string, field?: string): ApiError {
  return new ApiError(
    400,
    'INVALID_REQUEST',
    message,
    field ? [{ field, message }] : undefined,
  );
}
