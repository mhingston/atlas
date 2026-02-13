export class NoAvailableProviderError extends Error {
  constructor(kind: "llm" | "harness") {
    super(`No available ${kind} provider for the requested profile/fallback`);
    this.name = "NoAvailableProviderError";
  }
}
