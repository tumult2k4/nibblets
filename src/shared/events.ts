import type { SimEvent } from './types';

type Listener = (e: SimEvent) => void;

/** Buffers events during a tick, delivers them to subscribers on flush. */
export class EventBus {
  private buffer: SimEvent[] = [];
  private listeners: Listener[] = [];

  emit(e: SimEvent): void {
    this.buffer.push(e);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  /** Delivers buffered events; returns them for callers that want the batch. */
  flush(): SimEvent[] {
    const batch = this.buffer;
    this.buffer = [];
    for (const e of batch) for (const l of this.listeners) l(e);
    return batch;
  }

  pending(): readonly SimEvent[] {
    return this.buffer;
  }
}
