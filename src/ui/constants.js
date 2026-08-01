/**
 * Shared UI timings.
 *
 * The stamp is the one animation the app blocks input for, so its duration is
 * a single number both stamp sites read — the CSS keyframes derive their own
 * timings from it, and the gesture guard is pinned to it. Change it here and
 * the animation, the guard and the Record screen all move together.
 */

/** Full visible life of a filing stamp: land, hold, lift. */
export const STAMP_MS = 880

/** How long the swipe surface ignores input after a stamp starts. */
export const STAMP_GUARD_MS = STAMP_MS + 40

/**
 * Reduced motion collapses the stamp to ~nothing (styles.css forces
 * animation-duration: 1ms), so the full guard would swallow input for the best
 * part of a second after a visually instant stamp. This is a debounce, not an
 * animation wait.
 */
export const STAMP_REDUCED_GUARD_MS = 120
