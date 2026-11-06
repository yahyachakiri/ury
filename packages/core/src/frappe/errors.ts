/**
 * Parses any Frappe API error object, exception, or server response into a human-readable string.
 *
 * Frappe sends errors in multiple formats depending on how the exception was raised:
 * 1. `_server_messages`: JSON string (or array) of double-JSON-encoded message objects
 *    produced by `frappe.throw()` or `frappe.msgprint()`. May contain multiple validation messages.
 * 2. `exception` / `exc`: Python exception string (e.g. `frappe.exceptions.ValidationError: <message>`).
 * 3. `message` / `_error_message`: Top-level response message or string.
 * 4. `exc_type`: Exception class name (e.g. `MandatoryError`).
 *
 * This function extracts and surfaces ALL validation messages from Frappe so no error details
 * are hidden from the user.
 */
// Patch 46: technical failures get a short message the cashier can act on instead of the raw
// text (MariaDB deadlock, axios "Network Error", Python TypeError...). English defaults; an app
// passes its translations once with setErrorMessages.
export interface ErrorMessages {
  network: string;
  busy: string;
  session: string;
  unavailable: string;
  unexpected: string;
  printDraw: string; // Patch 50: the browser could not draw a ticket for the printer
  printerUnreachable: string; // Patch 51: a network printer (IP address) does not answer
  qzNotRunning: string; // Patch 55: QZ Tray is not running (or closed) on this device
}

const errorMessages: ErrorMessages = {
  network: 'No connection to the server. Check the internet connection and try again.',
  busy: 'The system was busy for a moment and nothing was saved. Try again.',
  session: 'Your session has expired. Reload the page and log in again.',
  unavailable: 'The server is not responding. Wait a moment and try again.',
  unexpected: 'Something went wrong. Try again; if it happens again, tell your manager.',
  printDraw: 'The ticket could not be prepared for the printer. Try again.',
  printerUnreachable: 'The printer does not answer. Check that it is on and connected to the network, then print again.',
  qzNotRunning: 'QZ Tray is not running on this device, start it and print again', // no final period: shown inside other messages
};

export function setErrorMessages(messages: Partial<ErrorMessages>): void {
  Object.assign(errorMessages, messages);
}

export function errorMessage(key: keyof ErrorMessages): string {
  return errorMessages[key];
}

const LOCK_ERROR = /QueryDeadlockError|QueryTimeoutError|Deadlock found when trying to get lock|Lock wait timeout exceeded/;
const SESSION_ERROR = /CSRFTokenError|SessionExpired|AuthenticationError/;

// JavaScript runtime errors are bugs, never a message for the cashier.
const isRuntimeError = (err: unknown): boolean =>
  err instanceof TypeError || err instanceof ReferenceError || err instanceof RangeError || err instanceof SyntaxError;

function technicalMessage(e: Record<string, unknown>): string | null {
  const status = typeof e.httpStatus === 'number' ? e.httpStatus : undefined;
  if (status === 0) return errorMessages.network;
  const text = [e.exc_type, e.exception, e._server_messages, e.message]
    .filter((v) => typeof v === 'string')
    .join(' ');
  if (LOCK_ERROR.test(text)) return errorMessages.busy;
  if (SESSION_ERROR.test(String(e.exc_type ?? '')) || SESSION_ERROR.test(String(e.exception ?? ''))) {
    return errorMessages.session;
  }
  if (status === 502 || status === 503 || status === 504) return errorMessages.unavailable;
  return null;
}

export function parseFrappeError(err: unknown, fallback?: string): string {
  fallback = fallback || errorMessages.unexpected;
  if (!err) return fallback;
  if (isRuntimeError(err)) return fallback; // Patch 46

  // Direct string errors
  if (typeof err === 'string') {
    const trimmed = err.trim();
    return trimmed || fallback;
  }

  if (typeof err !== 'object') return fallback;

  const e = err as Record<string, unknown>;
  const technical = technicalMessage(e); // Patch 46
  if (technical) return technical;
  const parsedMessages: string[] = [];
  const seenMessages = new Set<string>(); // Patch 13

  // Helper to sanitize HTML markup into readable multiline text
  const cleanHtml = (str: string): string => {
    return str
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/\n\s*\n/g, '\n')
      .trim();
  };

  // Strategy 1: Parse _server_messages (from frappe.msgprint / frappe.throw)
  // Handles double-JSON encoded strings, arrays of JSON strings, or arrays of objects
  const serverMsgs = e._server_messages ?? (e.response as Record<string, unknown>)?._server_messages;

  if (serverMsgs) {
    try {
      const rawList: unknown[] =
        typeof serverMsgs === 'string'
          ? JSON.parse(serverMsgs)
          : Array.isArray(serverMsgs)
            ? serverMsgs
            : [];

      for (const item of rawList) {
        if (!item) continue;
        let msgObj: Record<string, unknown> | null = null;

        if (typeof item === 'string') {
          try {
            msgObj = JSON.parse(item);
          } catch {
            const clean = cleanHtml(item);
            if (clean) parsedMessages.push(clean);
          }
        } else if (typeof item === 'object') {
          msgObj = item as Record<string, unknown>;
        }

        // Patch 13: alerts are side notices (e.g. "Item Price added"), not the error.
        if (msgObj && !msgObj.alert) {
          const mainMsg =
            typeof msgObj.message === 'string'
              ? msgObj.message
              : typeof msgObj.msg === 'string'
                ? msgObj.msg
                : '';

          const title =
            typeof msgObj.title === 'string' &&
            msgObj.title !== 'Message' &&
            msgObj.title !== 'Error' &&
            msgObj.title !== 'Validation Error'
              ? msgObj.title
              : '';

          if (mainMsg) {
            // Patch 13: URY repeats the cause as "Error while updating order: <cause>".
            const cleaned = cleanHtml(mainMsg).replace(/^Error while (updating|settling) order:\s*/, '');
            if (cleaned && !seenMessages.has(cleaned)) {
              seenMessages.add(cleaned);
              parsedMessages.push(title ? `${title}: ${cleaned}` : cleaned);
            }
          }
        }
      }
    } catch {
      // Ignore JSON parse failure for _server_messages
    }
  }

  if (parsedMessages.length > 0) {
    // Return all extracted validation messages
    return parsedMessages.join('\n');
  }

  // Strategy 2: Extract message from Python exception trace (e.g. frappe.exceptions.ValidationError: <msg>)
  const exceptionStr =
    typeof e.exception === 'string'
      ? e.exception
      : typeof e.exc === 'string'
        ? e.exc
        : '';

  if (exceptionStr) {
    // Patch 46: only Frappe's own exceptions carry a message for the user; a bare Python
    // error ("TypeError: ...", "KeyError: ...") falls through to the fallback.
    const match = exceptionStr.match(/frappe\.exceptions\.\w+Error:\s*(.+)/s);

    if (match && match[1]) {
      const firstLine = match[1].split('\n')[0].trim();
      if (firstLine && firstLine !== 'There was an error.') {
        return cleanHtml(firstLine);
      }
    }
  }

  // Strategy 3: Check top-level .message property
  if (typeof e.message === 'string' && e.message) {
    const cleaned = cleanHtml(e.message);
    if (cleaned && cleaned !== 'There was an error.' && cleaned !== 'ValidationError') {
      return cleaned;
    }
  }

  // Strategy 4: Check _error_message / error_message
  if (typeof e._error_message === 'string' && e._error_message) {
    const cleaned = cleanHtml(e._error_message);
    if (cleaned) return cleaned;
  }

  // Strategy 5: Standard Error instance
  if (err instanceof Error && err.message) {
    const cleaned = cleanHtml(err.message);
    if (cleaned && cleaned !== 'There was an error.') return cleaned;
  }

  // Patch 46: no Strategy 6 (exc_type spelled out, e.g. "Type Error"): it told the cashier nothing.
  return fallback;
}
