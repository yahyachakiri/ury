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
export function parseFrappeError(err: unknown, fallback = 'An unexpected error occurred.'): string {
  if (!err) return fallback;

  // Direct string errors
  if (typeof err === 'string') {
    const trimmed = err.trim();
    return trimmed || fallback;
  }

  if (typeof err !== 'object') return fallback;

  const e = err as Record<string, unknown>;
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
    const match =
      exceptionStr.match(/frappe\.exceptions\.\w+Error:\s*(.+)/s) ||
      exceptionStr.match(/^\w+Error:\s*(.+)/s);

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

  // Strategy 6: Fall back to formatted exc_type (e.g. "MandatoryError" -> "Mandatory Error")
  if (typeof e.exc_type === 'string' && e.exc_type) {
    const parts = e.exc_type.split('.');
    const lastPart = parts[parts.length - 1] ?? '';
    const formatted = lastPart.replace(/([A-Z])/g, ' $1').trim();
    if (formatted) return formatted;
  }

  return fallback;
}
