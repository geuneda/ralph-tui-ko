---
name: ralph-tui-create-hierarchical-json
description: "Convert hierarchical PRD markdown to hierarchical-prd.json for ralph-tui execution. Parses 5-level work breakdown structure and creates JSON with validation gates. Triggers on: create hierarchical json, convert hierarchical prd, hierarchical to json, ralph hierarchical json."
---

# Ralph TUI Hierarchical JSON Converter

Convert hierarchical PRD markdown documents into `hierarchical-prd.json` format for ralph-tui execution with the hierarchical-json tracker.

---

## The Job

1. Read the hierarchical PRD markdown file
2. Parse the work breakdown structure (Epic -> Feature -> Story -> Task -> Subtask)
3. Extract validation gates for each level
4. Extract interface definitions and integration contracts
5. Generate `hierarchical-prd.json` with the correct structure
6. Save to `./tasks/hierarchical-prd.json`

---

## Input Format

The input should be a hierarchical PRD markdown file with:
- `[HIERARCHICAL-PRD]...[/HIERARCHICAL-PRD]` markers (optional, from ralph-tui-hierarchical-prd skill)
- Or a markdown file following the hierarchical PRD structure

### Expected Sections

```markdown
# Hierarchical PRD: Feature Name

## Overview
Description of the feature...

## Version
2.0 (Hierarchical)

## Target Branch
feature/feature-name

## Global Validation

### Commands by Level
- **subtask**: `command`
- **task**: `command`
...

### Criteria by Level
- **subtask**: Criterion
...

## Interfaces (optional)

### InterfaceName
- **Methods:** ...
- **Properties:** ...

## Work Breakdown

### E-001: Epic Title
**Description:** ...
**Validation:** ["command"]
**Criteria:** ["criterion"]

#### F-001.1: Feature Title
...
```

---

## Output Format

Generate `hierarchical-prd.json` with this structure:

```json
{
  "name": "Feature Name",
  "slug": "feature-name",
  "description": "Description from Overview section",
  "branchName": "feature/feature-name",
  "createdAt": "ISO timestamp",
  "version": "2.0",
  "workBreakdown": [
    {
      "id": "E-001",
      "type": "epic",
      "title": "Epic Title",
      "description": "Epic description",
      "status": "open",
      "priority": 1,
      "depth": 0,
      "children": [
        {
          "id": "F-001.1",
          "type": "feature",
          "parentId": "E-001",
          "depth": 1,
          ...
        }
      ],
      "validationGate": {
        "type": "epic-gate",
        "status": "pending",
        "commands": ["command"],
        "criteria": ["criterion"]
      }
    }
  ],
  "interfaces": [
    {
      "name": "InterfaceName",
      "description": "",
      "methods": [...],
      "properties": [...]
    }
  ],
  "integrationContracts": [...],
  "globalValidation": {
    "commands": {
      "subtask": ["command"],
      "task": ["command"],
      "story": ["command"],
      "feature": ["command"],
      "epic": ["command"]
    },
    "criteria": {
      "subtask": ["criterion"],
      "task": ["criterion"],
      "story": ["criterion"],
      "feature": ["criterion"],
      "epic": ["criterion"]
    }
  }
}
```

---

## Parsing Rules

### ID Format
- Epic: `E-XXX` (e.g., E-001)
- Feature: `F-XXX.X` (e.g., F-001.1)
- Story: `S-XXX.X.X` (e.g., S-001.1.1)
- Task: `T-XXX.X.X.X` (e.g., T-001.1.1.1)
- Subtask: `ST-XXX.X.X.X.X` (e.g., ST-001.1.1.1.1)

### Heading Levels
- `### E-XXX:` = Epic (h3)
- `#### F-XXX.X:` = Feature (h4)
- `##### S-XXX.X.X:` = Story (h5)
- `###### T-XXX.X.X.X:` = Task (h6)
- `####### ST-XXX.X.X.X.X:` = Subtask (h7)

### Field Extraction

For each work item, extract:

```markdown
### E-001: Epic Title
**Description:** The epic description
**Validation:** ["cmd1", "cmd2"]
**Criteria:** ["criterion1"]
**Component:** ComponentName (Feature level)
**Provides:** [Interface1, Interface2] (Feature level)
**Requires:** [{interface: IName, providedBy: F-xxx}] (Feature level)
**Acceptance Criteria:**
- [ ] Criterion 1
- [ ] Criterion 2
```

### Global Validation Parsing

```markdown
## Global Validation

### Commands by Level
- **subtask**: `bun run typecheck`
- **task**: `bun run test`
```

Extract commands and criteria for each level.

---

## Implementation Steps

1. **Read the PRD file**
   ```bash
   cat ./tasks/prd-*.md
   # or the specified file path
   ```

2. **Extract metadata**
   - Name from `# Hierarchical PRD: Name`
   - Branch from `## Target Branch`
   - Description from `## Overview`

3. **Parse Global Validation**
   - Extract commands and criteria for each level

4. **Parse Interfaces** (if present)
   - Name, methods, properties, events

5. **Parse Work Breakdown**
   - Recursively parse each level
   - Build parent-child relationships
   - Extract validation gates

6. **Generate JSON**
   - Use the exact structure shown above
   - Set all statuses to "open"
   - Set all validation gates to "pending"

7. **Save file**
   ```bash
   # Save to tasks directory
   mkdir -p ./tasks
   # Write hierarchical-prd.json
   ```

---

## Conversion Example

### Input (markdown)

```markdown
# Hierarchical PRD: Player Movement

## Overview
Implement player movement system.

## Target Branch
feature/player-movement

## Global Validation

### Commands by Level
- **subtask**: `bun run typecheck`
- **task**: `bun run test`
- **story**: `bun run test:integration`
- **feature**: `bun run test:e2e`
- **epic**: `bun run test:all`

## Work Breakdown

### E-001: Player Movement System
**Description:** Complete movement system
**Validation:** ["bun run test:all"]
**Criteria:** ["All tests pass"]

#### F-001.1: Ground Movement
**Description:** Horizontal movement
**Component:** PlayerMovement
**Provides:** [IMovable]
**Validation:** ["bun run test:e2e"]

##### S-001.1.1: Basic Movement
**Description:** As a player, I want to move left/right
**Acceptance Criteria:**
- [ ] Arrow keys work
- [ ] Speed is configurable
**Validation:** ["bun run test:integration"]

###### T-001.1.1.1: Input Handler
**Description:** Handle movement input
**Validation:** ["bun run test"]

####### ST-001.1.1.1.1: Create InputReader
**Description:** Create the input reader component
**Validation:** ["bun run typecheck"]
```

### Output (JSON)

```json
{
  "name": "Player Movement",
  "slug": "player-movement",
  "description": "Implement player movement system.",
  "branchName": "feature/player-movement",
  "createdAt": "2025-01-30T00:00:00.000Z",
  "version": "2.0",
  "workBreakdown": [
    {
      "id": "E-001",
      "type": "epic",
      "title": "Player Movement System",
      "description": "Complete movement system",
      "status": "open",
      "priority": 1,
      "depth": 0,
      "children": [
        {
          "id": "F-001.1",
          "type": "feature",
          "title": "Ground Movement",
          "description": "Horizontal movement",
          "status": "open",
          "priority": 1,
          "depth": 1,
          "parentId": "E-001",
          "componentSpec": {
            "name": "PlayerMovement",
            "provides": ["IMovable"],
            "requires": []
          },
          "children": [
            {
              "id": "S-001.1.1",
              "type": "story",
              "title": "Basic Movement",
              "description": "As a player, I want to move left/right",
              "status": "open",
              "priority": 1,
              "depth": 2,
              "parentId": "F-001.1",
              "acceptanceCriteria": [
                "Arrow keys work",
                "Speed is configurable"
              ],
              "children": [
                {
                  "id": "T-001.1.1.1",
                  "type": "task",
                  "title": "Input Handler",
                  "description": "Handle movement input",
                  "status": "open",
                  "priority": 1,
                  "depth": 3,
                  "parentId": "S-001.1.1",
                  "children": [
                    {
                      "id": "ST-001.1.1.1.1",
                      "type": "subtask",
                      "title": "Create InputReader",
                      "description": "Create the input reader component",
                      "status": "open",
                      "priority": 1,
                      "depth": 4,
                      "parentId": "T-001.1.1.1",
                      "children": [],
                      "validationGate": {
                        "type": "subtask-gate",
                        "status": "pending",
                        "commands": ["bun run typecheck"],
                        "criteria": ["Code compiles"]
                      }
                    }
                  ],
                  "validationGate": {
                    "type": "task-gate",
                    "status": "pending",
                    "commands": ["bun run test"],
                    "criteria": ["Unit tests pass"]
                  }
                }
              ],
              "validationGate": {
                "type": "story-gate",
                "status": "pending",
                "commands": ["bun run test:integration"],
                "criteria": ["Integration tests pass"]
              }
            }
          ],
          "validationGate": {
            "type": "feature-gate",
            "status": "pending",
            "commands": ["bun run test:e2e"],
            "criteria": ["E2E tests pass"]
          }
        }
      ],
      "validationGate": {
        "type": "epic-gate",
        "status": "pending",
        "commands": ["bun run test:all"],
        "criteria": ["All tests pass"]
      }
    }
  ],
  "interfaces": [],
  "integrationContracts": [],
  "globalValidation": {
    "commands": {
      "subtask": ["bun run typecheck"],
      "task": ["bun run test"],
      "story": ["bun run test:integration"],
      "feature": ["bun run test:e2e"],
      "epic": ["bun run test:all"]
    },
    "criteria": {
      "subtask": ["Code compiles"],
      "task": ["Unit tests pass"],
      "story": ["Integration tests pass"],
      "feature": ["E2E tests pass"],
      "epic": ["All tests pass"]
    }
  }
}
```

---

## Validation

After generating the JSON:

1. **Verify structure**
   - All required fields present
   - Version is "2.0"
   - Parent-child relationships correct

2. **Verify IDs**
   - ID format matches type (E-, F-, S-, T-, ST-)
   - Child IDs extend parent IDs correctly

3. **Verify validation gates**
   - Each work item has a validation gate
   - Gate type matches work item type

4. **Test with ralph-tui**
   ```bash
   ralph-tui run --prd ./tasks/hierarchical-prd.json --tracker hierarchical-json
   ```

---

## Checklist

Before completing:

- [ ] Read and parsed the source PRD markdown
- [ ] Extracted all metadata (name, slug, branch, description)
- [ ] Parsed global validation config
- [ ] Parsed all work items with correct hierarchy
- [ ] Set all statuses to "open"
- [ ] Set all validation gate statuses to "pending"
- [ ] Generated valid JSON structure
- [ ] Saved to `./tasks/hierarchical-prd.json`
- [ ] Verified file is valid JSON
