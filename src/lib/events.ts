type EventListener = (event: BackendEvent) => void;

export type BackendEvent = {
  type: string;
  at: string;
  payload?: Record<string, unknown>;
};

class EventBus {
  private listeners = new Set<EventListener>();

  subscribe(listener: EventListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  publish(type: string, payload?: Record<string, unknown>) {
    const event: BackendEvent = {
      type,
      at: new Date().toISOString(),
      payload,
    };

    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

export const backendEvents = new EventBus();

