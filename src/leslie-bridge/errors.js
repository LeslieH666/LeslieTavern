export class LeslieBridgeRequestError extends Error {
    /**
     * @param {string} code Stable Bridge error code.
     * @param {string} message Client-facing error message.
     * @param {number} [status] HTTP status.
     */
    constructor(code, message, status = 400) {
        super(message);
        this.name = 'LeslieBridgeRequestError';
        this.code = code;
        this.status = status;
    }
}
