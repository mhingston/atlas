export interface AtlasClientConfig {
  baseUrl: string;
}

export interface Job {
  id: string;
  workflow_id: string;
  status: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  created_at: string;
  started_at?: string;
  finished_at?: string;
}

export interface Artifact {
  id: string;
  type: string;
  job_id: string;
  title?: string;
  content_md?: string;
  data: Record<string, unknown>;
  created_at: string;
}

export interface SearchResult {
  owner_id: string;
  owner_type: string;
  score: number;
}

export interface SkillSummary {
  name: string;
  description?: string | null;
  path: string;
  allowedTools?: string[] | null;
}

export interface SkillDetail extends SkillSummary {
  content: string;
  frontmatter?: Record<string, string | string[]> | null;
}

export class AtlasClient {
  private baseUrl: string;

  constructor(config: AtlasClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "Unknown error");
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    return response.json() as Promise<T>;
  }

  async health(): Promise<{ status: string }> {
    return this.request("/health");
  }

  async listJobs(params?: {
    status?: string;
    workflow?: string;
    limit?: number;
  }): Promise<Job[]> {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set("status", params.status);
    if (params?.workflow) searchParams.set("workflow", params.workflow);
    if (params?.limit) searchParams.set("limit", String(params.limit));
    const query = searchParams.toString();
    return this.request(`/jobs${query ? `?${query}` : ""}`);
  }

  async getJob(id: string): Promise<Job> {
    return this.request(`/jobs/${id}`);
  }

  async createJob(
    workflowId: string,
    input: Record<string, unknown>,
  ): Promise<Job> {
    return this.request("/jobs", {
      method: "POST",
      body: JSON.stringify({ workflow_id: workflowId, input }),
    });
  }

  async approveJob(id: string): Promise<Job> {
    return this.request(`/jobs/${id}/approve`, { method: "POST" });
  }

  async denyJob(id: string): Promise<Job> {
    return this.request(`/jobs/${id}/deny`, { method: "POST" });
  }

  async listArtifacts(params?: {
    type?: string;
    limit?: number;
  }): Promise<Artifact[]> {
    const searchParams = new URLSearchParams();
    if (params?.type) searchParams.set("type", params.type);
    if (params?.limit) searchParams.set("limit", String(params.limit));
    const query = searchParams.toString();
    return this.request(`/artifacts${query ? `?${query}` : ""}`);
  }

  async getArtifact(id: string): Promise<Artifact> {
    return this.request(`/artifacts/${id}`);
  }

  async listSkills(): Promise<SkillSummary[]> {
    const response = await this.request<{ skills: SkillSummary[] }>("/skills");
    return response.skills;
  }

  async getSkill(name: string): Promise<SkillDetail> {
    return this.request(`/skills/${encodeURIComponent(name)}`);
  }

  async search(
    query: string,
    params?: { limit?: number },
  ): Promise<SearchResult[]> {
    const searchParams = new URLSearchParams({ q: query });
    if (params?.limit) searchParams.set("limit", String(params.limit));
    return this.request(`/search?${searchParams.toString()}`);
  }

  async sync(): Promise<{ message: string }> {
    return this.request("/sync", { method: "POST" });
  }

  async getJobTrace(id: string): Promise<Record<string, unknown>[]> {
    return this.request(`/jobs/${id}/trace`);
  }

  async getJobTimeline(id: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/jobs/${id}/timeline`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to fetch timeline`);
    }
    return response.text();
  }

  async getOpsDashboard(): Promise<string> {
    const response = await fetch(`${this.baseUrl}/ops`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to fetch ops dashboard`);
    }
    return response.text();
  }
}

export function getClient(): AtlasClient {
  const baseUrl = process.env.ATLAS_URL ?? "http://localhost:3000";
  return new AtlasClient({ baseUrl });
}
