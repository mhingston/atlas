/**
 * ISC Definition for digest.weekly artifact type
 */

import type { ISCDefinition } from "../types";

export const digestWeeklyISC: ISCDefinition = {
  artifactType: "digest.weekly",
  version: "1.0.0",
  idealCriteria: [
    {
      id: "ISC-DIG-001",
      criterion: "Covers all 7 days in period",
      priority: "CRITICAL",
      confidence: "EXPLICIT",
      verify: {
        type: "GREP",
        pattern:
          "\\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\\b",
      },
      domain: "completeness",
    },
    {
      id: "ISC-DIG-002",
      criterion: "Includes 3+ significant items per day",
      priority: "IMPORTANT",
      confidence: "EXPLICIT",
      verify: { type: "CUSTOM", description: "Verify daily item count" },
      domain: "completeness",
    },
    {
      id: "ISC-DIG-003",
      criterion: "Each item has source attribution or reference",
      priority: "CRITICAL",
      confidence: "EXPLICIT",
      verify: { type: "GREP", pattern: "https?://|\\[.*\\]|\\(.*\\)" },
      domain: "accuracy",
    },
    {
      id: "ISC-DIG-004",
      criterion: "Total length does not exceed 500 words",
      priority: "IMPORTANT",
      confidence: "EXPLICIT",
      verify: { type: "CLI", command: "wc -w" },
      domain: "format",
    },
    {
      id: "ISC-DIG-005",
      criterion: "Personal/private content is excluded",
      priority: "CRITICAL",
      confidence: "EXPLICIT",
      verify: { type: "CUSTOM", description: "Privacy filter check" },
      domain: "security",
    },
    {
      id: "ISC-DIG-006",
      criterion: "Groups related items thematically",
      priority: "NICE",
      confidence: "INFERRED",
      verify: { type: "CUSTOM", description: "Thematic coherence check" },
      domain: "style",
    },
  ],
  antiCriteria: [
    {
      id: "ISC-A-DIG-001",
      criterion: "No personal information exposed",
      priority: "CRITICAL",
      verify: { type: "CUSTOM", description: "PII detection scan" },
    },
    {
      id: "ISC-A-DIG-002",
      criterion: "No copy-paste from sources exceeding 10 words",
      priority: "IMPORTANT",
      verify: { type: "CUSTOM", description: "Plagiarism detection" },
    },
    {
      id: "ISC-A-DIG-003",
      criterion: "No empty or placeholder days",
      priority: "IMPORTANT",
      verify: { type: "CUSTOM", description: "Daily content validation" },
    },
  ],
  minCriteria: 6,
  scaleTier: "MEDIUM",
};
