---
id: "T-test-gen-scripts"
title: "Generate Web E2E Test Scripts"
priority: "P1"
estimated_time: "1-2h"
dependencies: ["T-test-gen-contracts"]
type: "test.gen-scripts"
surface-key: "."
surface-type: "web"
---

Generate executable test scripts for the ui-plugin-foundation feature.
Test type: web.

## Feature Paths

Discover the feature's testing directory layout before starting:
```bash
ls docs/features/ui-plugin-foundation/testing/                                 # journeys
ls docs/features/ui-plugin-foundation/testing/<journey>/contracts/              # contracts
```

Read the approved test cases and generate scripts using the framework from the surface.

## Acceptance Criteria

- [ ] All acceptance criteria met

Type: **web**
