export type AvailabilityFn = () => Promise<boolean>;

export type Backend<T> = {
  id: string;
  runtime: T;
  available: AvailabilityFn;
};

export class BackendRegistry<T> {
  private map = new Map<string, Backend<T>>();
  register(b: Backend<T>) {
    this.map.set(b.id, b);
  }
  get(id: string) {
    return this.map.get(id);
  }
}
