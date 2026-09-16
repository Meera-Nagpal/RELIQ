/* ============================================================
   RELIQ — Server Route Helpers & Error Formatting
   
   Standardized HTTP response helpers adhering to:
   {
     "error": {
       "code": "CODE",
       "message": "Message"
     }
   }
   ============================================================ */

import type { IncomingMessage, ServerResponse } from 'http';
import { parseJsonBody, sendJson } from '../serverUtils';

export { sendJson };

/**
 * Sends a standardized JSON error response with appropriate HTTP status code.
 */
export function sendError(
  res: ServerResponse,
  statusCode: number,
  code: string,
  message: string
): void {
  sendJson(res, statusCode, {
    error: {
      code,
      message,
    },
  });
}

/**
 * Safely parses the JSON request body.
 * If JSON is invalid, sends a 400 INVALID_JSON response and returns null.
 */
export async function getJsonBody<T = any>(
  req: IncomingMessage,
  res: ServerResponse
): Promise<T | null> {
  try {
    return await parseJsonBody(req);
  } catch {
    sendError(res, 400, 'INVALID_JSON', 'Request body contains invalid or malformed JSON');
    return null;
  }
}
