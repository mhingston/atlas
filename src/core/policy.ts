/**
 * Policy: Capability-based security system
 *
 * Controls what workflows and plugins can do based on granted capabilities.
 */

export type Capability =
  | "db:read"
  | "db:write"
  | "llm:generate"
  | "embeddings:generate"
  | "net:http"
  | `fs:read:${string}`
  | `fs:write:${string}`
  | `exec:${string}`;

export class PolicyError extends Error {
  constructor(
    public capability: string,
    public context?: string,
  ) {
    super(
      `Permission denied: "${capability}" capability required${context ? ` (${context})` : ""}`,
    );
    this.name = "PolicyError";
  }
}

export interface Policy {
  /**
   * Check if a capability is granted
   */
  check(capability: Capability): boolean;

  /**
   * Assert a capability is granted, throw PolicyError if not
   */
  require(capability: Capability, context?: string): void;

  /**
   * Get all granted capabilities
   */
  capabilities(): Capability[];
}

/**
 * Default policy implementation
 */
export class DefaultPolicy implements Policy {
  constructor(private grants: Set<Capability> = new Set()) {}

  check(capability: Capability): boolean {
    // Exact match
    if (this.grants.has(capability)) {
      return true;
    }

    // Check wildcard patterns for scoped capabilities
    // e.g., "fs:read:*" grants "fs:read:./data"
    for (const grant of this.grants) {
      if (grant.endsWith(":*")) {
        const prefix = grant.slice(0, -1); // Remove the '*'
        if (capability.startsWith(prefix)) {
          return true;
        }
      }
    }

    return false;
  }

  require(capability: Capability, context?: string): void {
    if (!this.check(capability)) {
      throw new PolicyError(capability, context);
    }
  }

  capabilities(): Capability[] {
    return Array.from(this.grants);
  }

  /**
   * Grant additional capabilities
   */
  grant(...caps: Capability[]): void {
    for (const cap of caps) {
      this.grants.add(cap);
    }
  }

  /**
   * Revoke capabilities
   */
  revoke(...caps: Capability[]): void {
    for (const cap of caps) {
      this.grants.delete(cap);
    }
  }
}

/**
 * Create default policy for workflows
 *
 * Defaults:
 * - Allow: db:read, llm:generate, embeddings:generate
 * - Deny: db:write, exec:*, fs:write:*
 */
export function createDefaultWorkflowPolicy(): Policy {
  const policy = new DefaultPolicy();
  policy.grant("db:read", "llm:generate", "embeddings:generate");
  return policy;
}

/**
 * Create a workflow policy based on declared capabilities.
 *
 * If no capabilities are declared, fall back to default workflow policy.
 * If declared, start with db:read and grant only the requested caps.
 */
export function createWorkflowPolicy(
  requiredCapabilities?: Capability[],
): Policy {
  if (!requiredCapabilities || requiredCapabilities.length === 0) {
    return createDefaultWorkflowPolicy();
  }

  const policy = new DefaultPolicy();
  policy.grant("db:read");
  policy.grant(...requiredCapabilities);
  return policy;
}

/**
 * Create unrestricted policy (for system/admin workflows)
 */
export function createUnrestrictedPolicy(): Policy {
  const policy = new DefaultPolicy();
  policy.grant(
    "db:read",
    "db:write",
    "llm:generate",
    "embeddings:generate",
    "net:http",
    "fs:read:*",
    "fs:write:*",
    "exec:*",
  );
  return policy;
}
