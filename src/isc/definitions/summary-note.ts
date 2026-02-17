/**
 * ISC Definition for summary.note artifact type
 */

import type { ISCDefinition } from "../types";

export const summaryNoteISC: ISCDefinition = {
  artifactType: "summary.note",
  version: "1.0.0",
  idealCriteria: [
    {
      id: "ISC-SUM-001",
      criterion: "Captures 3-5 key points from source material",
      priority: "CRITICAL",
      confidence: "EXPLICIT",
      verify: { type: "CUSTOM", description: "LLM evaluation vs source" },
      domain: "completeness",
    },
    {
      id: "ISC-SUM-002",
      criterion: "No factual claims without source attribution",
      priority: "CRITICAL",
      confidence: "EXPLICIT",
      verify: { type: "GREP", pattern: "\\[.*?\\]|\\(.*?\\)" },
      domain: "accuracy",
    },
    {
      id: "ISC-SUM-003",
      criterion: "Length between 100-300 words",
      priority: "IMPORTANT",
      confidence: "EXPLICIT",
      verify: { type: "CLI", command: "wc -w" },
      domain: "format",
    },
    {
      id: "ISC-SUM-004",
      criterion: "Tone matches source material intent",
      priority: "NICE",
      confidence: "INFERRED",
      verify: { type: "CUSTOM", description: "Sentiment analysis comparison" },
      domain: "style",
    },
  ],
  antiCriteria: [
    {
      id: "ISC-A-SUM-001",
      criterion: "No hallucinated facts not in source",
      priority: "CRITICAL",
      verify: {
        type: "CUSTOM",
        description: "Cross-reference with source entities",
      },
    },
    {
      id: "ISC-A-SUM-002",
      criterion: "No copy-paste from source exceeding 10 words",
      priority: "IMPORTANT",
      verify: { type: "CUSTOM", description: "Plagiarism detection" },
    },
  ],
  minCriteria: 4,
  scaleTier: "SIMPLE",
};
