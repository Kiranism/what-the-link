const log =
  (level: string) =>
  (message: string, meta?: Record<string, unknown>) => {
    const line = meta
      ? `${new Date().toISOString()} [${level}] ${message} ${JSON.stringify(meta)}`
      : `${new Date().toISOString()} [${level}] ${message}`;
    console.log(line);
  };

export const logger = {
  info: log("INFO"),
  warn: log("WARN"),
  error: log("ERROR"),
};
