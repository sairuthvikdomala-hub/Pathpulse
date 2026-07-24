// ─────────────────────────────────────────────────────────────
// PathPulse Driver – Security Utilities
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
// ── SECURITY: Client-Side Rate Limiter ──────────────────────
/**
 * SECURITY: Sliding-window rate limiter for GPS writes.
 * Prevents abuse by throttling Firestore writes from the client.
 */
export class RateLimiter {
  private timestamps: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs: number;
  constructor(maxRequests: number, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }
  tryAcquire(): boolean {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(t => now - t < this.windowMs);
    if (this.timestamps.length >= this.maxRequests) {
      return false;
    }
    this.timestamps.push(now);
    return true;
  }
  getRetryAfterMs(): number {
    if (this.timestamps.length < this.maxRequests) return 0;
    const oldest = this.timestamps[0];
    return Math.max(0, this.windowMs - (Date.now() - oldest));
  }
  reset(): void {
    this.timestamps = [];
  }
}
/**
 * SECURITY: Log security-relevant events.
 * In production, this could be wired to a monitoring service.
 */
export function logSecurityEvent(
  event: 'RATE_LIMIT' | 'VALIDATION_FAIL' | 'AUTH_FAIL' | 'SUSPICIOUS',
  details: string
): void {
  const timestamp = new Date().toISOString();
  if (import.meta.env.DEV) {
    console.warn(`[SECURITY:${event}] ${timestamp} — ${details}`);
  }
}
