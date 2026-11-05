export type ID = number;

/** Monotonic ID allocator; its counter lives in world state so saves resume it. */
export interface IdCounter {
  nextId: number;
}

export function allocId(c: IdCounter): ID {
  const id = c.nextId;
  c.nextId += 1;
  return id;
}
