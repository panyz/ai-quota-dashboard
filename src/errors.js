export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "UsageError";
  }
}

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConfigError";
    this.code = "config_error";
  }
}

export class DataError extends Error {
  constructor(message, { cause } = {}) {
    super(message);
    this.name = "DataError";
    this.code = "data_error";
    if (cause) this.cause = cause;
  }
}
