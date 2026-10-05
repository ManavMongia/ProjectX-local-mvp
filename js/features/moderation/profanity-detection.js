/**
 * Profanity Detection Feature
 * Exposes profanity scanning to the UI layer and window.
 */

import { hasProfanity } from '../../services/moderation-service.js';

export { hasProfanity };
window.hasProfanity = hasProfanity;
