/**
 * ISC Definition for brainstorm.session artifact type
 */

import type { ISCDefinition } from "../types";

export const brainstormSessionISC: ISCDefinition = {
  artifactType: "brainstorm.session",
  version: "1.0.0",
  idealCriteria: [
    {
      id: "ISC-BRN-001",
      criterion: "Contains at least 5 distinct ideas or concepts",
      priority: "CRITICAL",
      confidence: "EXPLICIT",
      verify: {
        type: "CUSTOM",
        description: "Count bullet points or numbered items",
      },
      domain: "completeness",
    },
    {
      id: "ISC-BRN-002",
      criterion: "Each idea has supporting reasoning or context",
      priority: "CRITICAL",
      confidence: "EXPLICIT",
      verify: {
        type: "CUSTOM",
        description: "Verify each point has explanatory text",
      },
      domain: "completeness",
    },
    {
      id: "ISC-BRN-003",
      criterion: "Ideas are relevant to the original topic",
      priority: "IMPORTANT",
      confidence: "EXPLICIT",
      verify: {
        type: "CUSTOM",
        description: "LLM relevance check against topic",
      },
      domain: "accuracy",
    },
    {
      id: "ISC-BRN-004",
      criterion: "Explores multiple angles or perspectives",
      priority: "NICE",
      confidence: "INFERRED",
      verify: { type: "CUSTOM", description: "Check for variety in approach" },
      domain: "style",
    },
  ],
  antiCriteria: [
    {
      id: "ISC-A-BRN-001",
      criterion: "No duplicate or highly similar ideas",
      priority: "IMPORTANT",
      verify: { type: "CUSTOM", description: "Deduplication check" },
    },
    {
      id: "ISC-A-BRN-002",
      criterion: "No generic or obvious suggestions",
      priority: "NICE",
      verify: { type: "CUSTOM", description: "Specificity evaluation" },
    },
  ],
  minCriteria: 4,
  scaleTier: "SIMPLE",
};
