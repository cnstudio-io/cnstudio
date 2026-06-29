/** Subscribe to an engine event; returns an unsubscribe function. */
export type Listenable = (listener: () => void) => () => void;
