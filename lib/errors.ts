/**
 * MedPulse Enterprise - Error Handling
 * Centralized error handling and custom exceptions
 */

export enum ErrorCode {
  // Authentication
  AUTH_INVALID_EMAIL = "AUTH_INVALID_EMAIL",
  AUTH_WRONG_PASSWORD = "AUTH_WRONG_PASSWORD",
  AUTH_USER_NOT_FOUND = "AUTH_USER_NOT_FOUND",
  AUTH_USER_DISABLED = "AUTH_USER_DISABLED",
  AUTH_EMAIL_ALREADY_IN_USE = "AUTH_EMAIL_ALREADY_IN_USE",
  AUTH_WEAK_PASSWORD = "AUTH_WEAK_PASSWORD",
  AUTH_UNAUTHORIZED = "AUTH_UNAUTHORIZED",
  AUTH_SESSION_EXPIRED = "AUTH_SESSION_EXPIRED",

  // Authorization
  PERMISSION_DENIED = "PERMISSION_DENIED",
  INSUFFICIENT_ROLE = "INSUFFICIENT_ROLE",
  RESOURCE_FORBIDDEN = "RESOURCE_FORBIDDEN",

  // Validation
  VALIDATION_FAILED = "VALIDATION_FAILED",
  INVALID_INPUT = "INVALID_INPUT",
  MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD",

  // Operations
  OPERATION_FAILED = "OPERATION_FAILED",
  RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND",
  RESOURCE_ALREADY_EXISTS = "RESOURCE_ALREADY_EXISTS",
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",

  // Upload
  UPLOAD_FAILED = "UPLOAD_FAILED",
  FILE_TOO_LARGE = "FILE_TOO_LARGE",
  INVALID_FILE_TYPE = "INVALID_FILE_TYPE",

  // Server
  INTERNAL_ERROR = "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
  TIMEOUT = "TIMEOUT",

  // Network
  NETWORK_ERROR = "NETWORK_ERROR",
  OFFLINE = "OFFLINE",
}

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public statusCode: number = 500,
    public details?: Record<string, any>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class AuthError extends AppError {
  constructor(code: ErrorCode, message: string, details?: Record<string, any>) {
    super(code, message, 401, details);
    this.name = "AuthError";
  }
}

export class PermissionError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super(ErrorCode.PERMISSION_DENIED, message, 403, details);
    this.name = "PermissionError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super(ErrorCode.VALIDATION_FAILED, message, 400, details);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(ErrorCode.RESOURCE_NOT_FOUND, `${resource} not found`, 404);
    this.name = "NotFoundError";
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = "Rate limit exceeded") {
    super(ErrorCode.RATE_LIMIT_EXCEEDED, message, 429);
    this.name = "RateLimitError";
  }
}

/**
 * Convert Firebase errors to AppError
 */
export const handleFirebaseError = (error: any): AppError => {
  const code = error.code || "";

  const errorMap: Record<string, { code: ErrorCode; message: string; statusCode: number }> = {
    "auth/invalid-email": { code: ErrorCode.AUTH_INVALID_EMAIL, message: "Invalid email address", statusCode: 400 },
    "auth/wrong-password": { code: ErrorCode.AUTH_WRONG_PASSWORD, message: "Wrong password", statusCode: 401 },
    "auth/user-not-found": { code: ErrorCode.AUTH_USER_NOT_FOUND, message: "User not found", statusCode: 404 },
    "auth/user-disabled": { code: ErrorCode.AUTH_USER_DISABLED, message: "User account disabled", statusCode: 403 },
    "auth/email-already-in-use": {
      code: ErrorCode.AUTH_EMAIL_ALREADY_IN_USE,
      message: "Email already in use",
      statusCode: 409,
    },
    "auth/weak-password": {
      code: ErrorCode.AUTH_WEAK_PASSWORD,
      message: "Password must be at least 6 characters",
      statusCode: 400,
    },
    "permission-denied": { code: ErrorCode.PERMISSION_DENIED, message: "Permission denied", statusCode: 403 },
    "not-found": { code: ErrorCode.RESOURCE_NOT_FOUND, message: "Resource not found", statusCode: 404 },
  };

  const mapped = errorMap[code];
  if (mapped) {
    return new AppError(mapped.code, mapped.message, mapped.statusCode, { originalCode: code });
  }

  return new AppError(ErrorCode.INTERNAL_ERROR, error.message || "An error occurred", 500);
};

/**
 * Handle network errors
 */
export const handleNetworkError = (error: any): AppError => {
  if (error instanceof TypeError && error.message.includes("fetch")) {
    return new AppError(ErrorCode.NETWORK_ERROR, "Network error. Please check your connection.", 503);
  }

  if (error.message === "Offline") {
    return new AppError(ErrorCode.OFFLINE, "You are offline. Please check your connection.", 503);
  }

  return new AppError(ErrorCode.INTERNAL_ERROR, error.message || "An unexpected error occurred", 500);
};
