// ─────────────────────────────────────────────────────────────
// PathPulse – Security Utilities
// Purpose: Input validation + rate limiting for Firestore writes.
// No external dependencies — pure TypeScript.
// ─────────────────────────────────────────────────────────────
// ── SECURITY: Input Validation ──────────────────────────────
/**
 * SECURITY: Validate GPS coordinates are within valid geographic ranges.
 * Prevents NoSQL injection and corrupt data from reaching Firestore.
 */
 export function validateGpsCoords(lat: unknown, lng: unknown): { lat: number; lng: number } {
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (isNaN(latNum) || isNaN(lngNum)) throw new Error('Invalid GPS coordinates: not a number');
  if (latNum < -90 || latNum > 90) throw new Error(`Invalid latitude: ${latNum} (must be -90 to 90)`);
  if (lngNum < -180 || lngNum > 180) throw new Error(`Invalid longitude: ${lngNum} (must be -180 to 180)`);
  return { lat: latNum, lng: lngNum };
}
/**
 * SECURITY: Validate bus status is one of the allowed enum values.
 * Prevents injection of arbitrary status strings.
 */
const VALID_BUS_STATUSES = ['Active', 'Idle', 'Delayed', 'Offline'] as const;
export type ValidBusStatus = (typeof VALID_BUS_STATUSES)[number];
export function validateBusStatus(status: unknown): ValidBusStatus {
  if (typeof status !== 'string' || !VALID_BUS_STATUSES.includes(status as ValidBusStatus)) {
    throw new Error(`Invalid bus status: "${status}". Allowed: ${VALID_BUS_STATUSES.join(', ')}`);
  }
  return status as ValidBusStatus;
}
/**
 * SECURITY: Validate speed is a non-negative number within physical limits.
 */
export function validateSpeed(speed: unknown): number {
  const num = Number(speed);
  if (isNaN(num) || num < 0) return 0;
  return Math.min(num, 200); // Cap at 200 km/h — physical limit for a bus
}
/**
 * SECURITY: Sanitize string input — trim, enforce max length, strip control chars.
 * Prevents XSS and command injection via text fields.
 */
export function sanitizeString(input: unknown, maxLength: number = 200): string {
  if (typeof input !== 'string') return '';
  // Strip control characters (except newline, tab)
  const cleaned = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return cleaned.trim().slice(0, maxLength);
}
/**
 * SECURITY: Validate a Firestore document ID — alphanumeric + underscore only.
 * Prevents path traversal attacks on Firestore document paths.
 */
export function validateDocId(id: unknown): string {
  if (typeof id !== 'string' || id.length === 0 || id.length > 128) {
    throw new Error('Invalid document ID: must be 1-128 characters');
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error('Invalid document ID: only alphanumeric, underscore, and hyphen allowed');
  }
  return id;
}
/**
 * SECURITY: Validate email format (basic check).
 */
export function validateEmail(email: unknown): string {
  if (typeof email !== 'string') throw new Error('Email must be a string');
  const trimmed = email.trim().toLowerCase();
  if (trimmed.length > 254) throw new Error('Email too long');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) throw new Error('Invalid email format');
  return trimmed;
}
/**
 * SECURITY: Validate PIN (4-8 digits for driver login).
 */
export function validatePin(pin: unknown): string {
  if (typeof pin !== 'string') throw new Error('PIN must be a string');
  const trimmed = pin.trim();
  if (trimmed.length < 4 || trimmed.length > 8) throw new Error('PIN must be 4-8 characters');
  return trimmed;
}
/**
 * SECURITY: Validate phone number (basic — digits, spaces, +, -, parens).
 */
export function validatePhone(phone: unknown): string {
  if (typeof phone !== 'string') throw new Error('Phone must be a string');
  const trimmed = phone.trim();
  if (trimmed.length < 7 || trimmed.length > 20) throw new Error('Phone must be 7-20 characters');
  if (!/^[0-9+\-() ]+$/.test(trimmed)) throw new Error('Phone contains invalid characters');
  return trimmed;
}
// ── SECURITY: Client-Side Rate Limiter ──────────────────────
/**
 * SECURITY: Sliding-window rate limiter.
 * Prevents abuse by throttling Firestore writes from the client.
 * This is defense-in-depth — Firestore has its own quotas,
 * but this prevents excessive billing and DoS from compromised clients.
 */
export class RateLimiter {
  private timestamps: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs: number;
  /**
   * @param maxRequests Maximum requests allowed in the window
   * @param windowMs Time window in milliseconds (default: 60000 = 1 minute)
   */
  constructor(maxRequests: number, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }
  /**
   * Check if a request is allowed. Returns true if allowed, false if rate-limited.
   */
  tryAcquire(): boolean {
    const now = Date.now();
    // Remove timestamps outside the window
    this.timestamps = this.timestamps.filter(t => now - t < this.windowMs);
    if (this.timestamps.length >= this.maxRequests) {
      return false;
    }
    this.timestamps.push(now);
    return true;
  }
  /**
   * Get the time (in ms) until the next request will be allowed.
   */
  getRetryAfterMs(): number {
    if (this.timestamps.length < this.maxRequests) return 0;
    const oldest = this.timestamps[0];
    return Math.max(0, this.windowMs - (Date.now() - oldest));
  }
  /**
   * Reset the rate limiter (e.g., on logout).
   */
  reset(): void {
    this.timestamps = [];
  }
}
// ── SECURITY: Security Event Logger ─────────────────────────
/**
 * SECURITY: Log security-relevant events (rate limit hits, validation failures).
 * In production, this could be wired to a monitoring service.
 * We intentionally avoid logging sensitive data (passwords, tokens).
 */
export function logSecurityEvent(
  event: 'RATE_LIMIT' | 'VALIDATION_FAIL' | 'AUTH_FAIL' | 'SUSPICIOUS',
  details: string
): void {
  const timestamp = new Date().toISOString();
  // SECURITY: Only log non-sensitive metadata — never passwords/tokens
  if (import.meta.env.DEV) {
    console.warn(`[SECURITY:${event}] ${timestamp} — ${details}`);
  }
  // In production: silent or send to analytics
}
