export type Profile = "fast" | "balanced" | "quality";

export type OutputParserConfig =
  | { type: "stdout_all" }
  | { type: "stdout_section"; start_marker: string; end_marker: string }
  | { type: "json_field"; field: string }
  | { type: "file_glob"; pattern: string }
  | { type: "exit_code" };

export type HarnessDefinition = {
  command: string;
  args_template?: string[];
  output_parsers?: {
    diff?: OutputParserConfig;
    plan?: OutputParserConfig;
    text?: OutputParserConfig;
    command_log?: OutputParserConfig;
  };
  timeout_ms?: number;
  env?: Record<string, string>;
};

export type RoutingConfig = {
  llm: {
    default_profile: Profile;
    profiles: Record<Profile, string[]>;
    fallback: string[];
  };
  embeddings: {
    default_profile: Profile;
    profiles: Record<Profile, string[]>;
    fallback: string[];
  };
  harness: {
    default_profile: Profile;
    profiles: Record<Profile, string[]>;
    fallback: string[];
  };
  harnesses?: Record<string, HarnessDefinition>;
};
