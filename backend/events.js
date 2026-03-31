const { EventEmitter } = require('events');

const emitter = new EventEmitter();

// Support many simultaneous SSE clients without triggering the default
// MaxListenersExceededWarning (default cap is 10).
emitter.setMaxListeners(1000);

/**
 * Broadcast a registration status change to all connected SSE clients.
 * @param {{ open: boolean, endTime: string|null }} status
 */
function broadcastStatusChange(status) {
  emitter.emit('registrationStatus', status);
}

module.exports = { emitter, broadcastStatusChange };
