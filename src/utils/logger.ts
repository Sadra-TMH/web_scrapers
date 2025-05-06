import path from "path";
import { FILE_DIR_PREFIX } from "./fileUtils";
import { LogOptions } from "./types";
import * as fsSync from "fs";
export type LogLevel = "info" | "error" | "warn" | "debug";

class Logger {
  private static logFile: string;
  private static writeStream: fsSync.WriteStream | null = null;

  static initialize(logDirectory: string = FILE_DIR_PREFIX) {
    // Ensure the log directory exists
    if (!fsSync.existsSync(logDirectory)) {
      fsSync.mkdirSync(logDirectory, { recursive: true });
    }

    this.logFile = path.join(logDirectory, "output.log");

    // Create or open the write stream
    this.writeStream = fsSync.createWriteStream(this.logFile, { flags: "a" });

    // Handle process termination
    process.on("exit", () => this.cleanup());
    process.on("SIGINT", () => {
      this.cleanup();
      process.exit();
    });
  }

  private static cleanup() {
    if (this.writeStream) {
      this.writeStream.end();
      this.writeStream = null;
    }
  }

  private static writeToFile(message: string) {
    if (!this.writeStream) {
      this.initialize();
    }
    this.writeStream?.write(message + "\n");
  }

  private static formatMessage(
    level: LogLevel,
    message: string,
    options?: LogOptions
  ): string {
    const timestamp = new Date().toISOString();
    const context = options?.context;
    let formattedMessage = `[${timestamp}] [${level.toUpperCase()}]`;

    if (context?.workerId) {
      formattedMessage += ` [${context.workerId}]`;
    }
    if (context?.component) {
      formattedMessage += ` [${context.component}]`;
    }
    if (context?.searchQuery) {
      formattedMessage += ` [Query: ${context.searchQuery}]`;
    }
    if (context?.url) {
      formattedMessage += ` [URL: ${context.url}]`;
    }

    formattedMessage += `: ${message}`;

    if (options?.error) {
      const error = options.error as Error;
      if (error.message) {
        formattedMessage += `\nError: ${error.message}`;
      }
      if (error.stack) {
        formattedMessage += `\nStack: ${error.stack}`;
      }
    }

    return formattedMessage;
  }

  static log(level: LogLevel, message: string, options?: LogOptions): void {
    const formattedMessage = this.formatMessage(level, message, options);
    this.writeToFile(formattedMessage);
  }

  static info(message: string, options?: LogOptions): void {
    this.log("info", message, options);
  }

  static error(message: string, options?: LogOptions): void {
    this.log("error", message, options);
  }

  static warn(message: string, options?: LogOptions): void {
    this.log("warn", message, options);
  }

  static debug(message: string, options?: LogOptions): void {
    this.log("debug", message, options);
  }
}

// Initialize logger
Logger.initialize();

export { Logger };