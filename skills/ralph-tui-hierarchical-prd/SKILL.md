---
name: ralph-tui-hierarchical-prd
description: "Generate a hierarchical Product Requirements Document (PRD) for ralph-tui. Creates 5-level work breakdown (Epic -> Feature -> Story -> Task -> Subtask) with validation gates for automated execution. Triggers on: create hierarchical prd, hierarchical prd for, plan hierarchical, breakdown feature."
---

# Ralph TUI Hierarchical PRD Generator

Create detailed hierarchical Product Requirements Documents with 5-level work breakdown optimized for AI agent execution via ralph-tui.

---

## The Job

1. Receive a feature description from the user
2. Ask clarifying questions to understand scope and complexity
3. **Always ask about validation gates** (what commands must pass at each level)
4. Determine the appropriate depth of breakdown (not all features need 5 levels)
5. Generate a hierarchical PRD with work breakdown structure
6. Output the PRD wrapped in `[HIERARCHICAL-PRD]...[/HIERARCHICAL-PRD]` markers

**Important:** Do NOT start implementing. Just create the PRD.

---

## Hierarchy Levels

### Level 0: Epic (E-xxx)
- **Duration:** 2+ weeks of work
- **Scope:** Large feature or system (e.g., "Player System", "Authentication System")
- **Validation Gate:** Full system integration tests, performance benchmarks

### Level 1: Feature (F-xxx.x)
- **Duration:** 3-5 days
- **Scope:** Independent functional unit (e.g., "Player Movement", "Login Flow")
- **Validation Gate:** E2E tests, interface contract verification

### Level 2: Story (S-xxx.x.x)
- **Duration:** 1 day or less
- **Scope:** User-facing functionality (e.g., "Basic Movement Implementation")
- **Validation Gate:** Integration tests, acceptance criteria verification

### Level 3: Task (T-xxx.x.x.x)
- **Duration:** 2-4 hours
- **Scope:** Development work unit (e.g., "Movement Input Handling")
- **Validation Gate:** Unit tests for the task

### Level 4: Subtask (ST-xxx.x.x.x.x)
- **Duration:** 1 hour or less
- **Scope:** Smallest implementation unit (e.g., "Key Binding Setup")
- **Validation Gate:** Code compilation, linting

---

## Clarifying Questions

Ask questions in sets of 3-5, iteratively. Focus on:

### Scope & Complexity
```
1. What is the scale of this feature?
   A. Small - Single component, few files (Story level sufficient)
   B. Medium - Multiple related components (Feature + Stories)
   C. Large - Major system or subsystem (Epic with full breakdown)
   D. Uncertain - Need to explore further

2. How many distinct functional areas are involved?
   A. Single area (1-2 features)
   B. Multiple areas (3-5 features)
   C. Many areas (5+ features)
   D. Not sure yet
```

### Validation Requirements
```
3. What validation commands should run at each level?

   For Subtask (code changes):
   A. bun run typecheck
   B. npm run typecheck && npm run lint
   C. pnpm typecheck && pnpm lint
   D. Other: [specify]

   For Task (unit tests):
   A. bun run test -- --grep {taskId}
   B. npm test -- --testPathPattern={taskId}
   C. Project doesn't use unit tests
   D. Other: [specify]

   For Story (integration):
   A. bun run test:integration
   B. npm run test:e2e
   C. Manual verification only
   D. Other: [specify]
```

### Dependencies & Interfaces
```
4. Does this feature need to interface with other systems?
   A. Yes - Need to define interface contracts
   B. No - Self-contained feature
   C. Maybe - Need to explore existing code first

5. Are there known dependencies or blockers?
   A. Yes - [please describe]
   B. No dependencies
   C. Need to investigate
```

---

## PRD Structure

### 1. Overview
```markdown
# Hierarchical PRD: [Feature Name]

## Overview
Brief description of the feature and problem it solves.

## Version
2.0 (Hierarchical)

## Target Branch
feature/[slug-name]
```

### 2. Global Validation Config
```markdown
## Global Validation

### Commands by Level
- **subtask**: `bun run typecheck`
- **task**: `bun run test`
- **story**: `bun run test:integration`
- **feature**: `bun run test:e2e`
- **epic**: `bun run test:all && bun run build`

### Criteria by Level
- **subtask**: Code compiles without errors
- **task**: All unit tests pass
- **story**: All acceptance criteria met
- **feature**: Interface contracts fulfilled
- **epic**: Full system integration verified
```

### 3. Interfaces (if applicable)
```markdown
## Interfaces

### IMovable
- **Methods:** Move(direction: Vector2), Stop()
- **Properties:** IsMoving: boolean, CurrentVelocity: Vector2

### IInputProvider
- **Methods:** GetMovementInput(): Vector2
- **Events:** OnInputChanged(input: Vector2)
```

### 4. Work Breakdown
```markdown
## Work Breakdown

### E-001: [Epic Title]
**Description:** [What this epic accomplishes]
**Validation:** ["bun run test:all"]
**Criteria:** ["Full system integration complete"]

#### F-001.1: [Feature Title]
**Description:** [Feature scope]
**Component:** ComponentName
**Provides:** [IInterface1, IInterface2]
**Requires:** [{interface: IInputProvider, providedBy: F-001.2}]
**Validation:** ["bun run test:e2e"]

##### S-001.1.1: [Story Title]
**Description:** As a [user], I want [feature] so that [benefit]
**Acceptance Criteria:**
- [ ] Criterion 1
- [ ] Criterion 2
**Validation:** ["bun run test:integration"]

###### T-001.1.1.1: [Task Title]
**Description:** [Development task]
**Validation:** ["bun run test -- input"]

####### ST-001.1.1.1.1: [Subtask Title]
**Description:** [Smallest unit of work]
**Validation:** ["bun run typecheck"]
```

### 5. Integration Contracts (if applicable)
```markdown
## Integration Contracts

### Movement-Input Contract
**Participants:**
- F-001.1 (provider: IMovementState)
- F-001.2 (consumer: IMovementState)

**Test Scenarios:**
1. When input is received, movement state updates
2. When movement stops, velocity becomes zero
```

---

## Depth Decision Guide

Not every feature needs all 5 levels. Decide based on complexity:

| Feature Size | Recommended Depth | Example |
|--------------|-------------------|---------|
| Small (1-2 days) | Story + Tasks | Bug fix, small enhancement |
| Medium (1-2 weeks) | Feature + Stories + Tasks | New component, module |
| Large (2+ weeks) | Full Epic breakdown | New system, major refactor |

**Rule of thumb:**
- If a story takes more than a day, break it into tasks
- If a task takes more than 4 hours, break it into subtasks
- If you have 5+ features, consider an epic

---

## Output Format

**CRITICAL:** Wrap the final PRD in markers for TUI parsing:

```
[HIERARCHICAL-PRD]
# Hierarchical PRD: Feature Name

## Overview
...

## Global Validation
...

## Work Breakdown
...
[/HIERARCHICAL-PRD]
```

The TUI will:
1. Parse this markdown
2. Convert to `hierarchical-prd.json`
3. Save to `./tasks/hierarchical-prd.json`

---

## JSON Output Format

The generated hierarchical PRD will be converted to this JSON structure:

```json
{
  "name": "Feature Name",
  "slug": "feature-name",
  "description": "...",
  "branchName": "feature/feature-name",
  "createdAt": "2025-01-30T00:00:00Z",
  "version": "2.0",
  "workBreakdown": [
    {
      "id": "E-001",
      "type": "epic",
      "title": "Epic Title",
      "description": "...",
      "status": "open",
      "priority": 1,
      "depth": 0,
      "children": [
        {
          "id": "F-001.1",
          "type": "feature",
          "title": "Feature Title",
          ...
        }
      ],
      "validationGate": {
        "type": "epic-gate",
        "status": "pending",
        "commands": ["bun run test:all"],
        "criteria": ["Full system integration"]
      }
    }
  ],
  "interfaces": [...],
  "integrationContracts": [...],
  "globalValidation": {
    "commands": {
      "subtask": ["bun run typecheck"],
      "task": ["bun run test"],
      ...
    },
    "criteria": {
      "subtask": ["Code compiles"],
      ...
    }
  }
}
```

---

## Example: Player Movement System

**User:** Create a hierarchical PRD for a player movement system in a 2D platformer game.

**Assistant:** I'll help create a hierarchical PRD. Let me ask a few questions:

1. What is the scale of this feature?
   A. Small - Basic movement only
   B. Medium - Movement + jump + physics
   C. Large - Full player controller system
   D. Other

2. What validation commands for code changes?
   A. bun run typecheck
   B. npm run typecheck && npm run lint
   C. Other: [specify]

**User:** 1C, 2A

**Assistant:** Great! A couple more questions:

3. Does this need to interface with other systems?
   A. Yes - Input system, animation, physics
   B. No - Self-contained

4. What testing framework?
   A. Jest/Vitest
   B. Unity Test Framework
   C. No automated tests
   D. Other

**User:** 3A, 4B

**Assistant:** Perfect, generating the hierarchical PRD.

[HIERARCHICAL-PRD]
# Hierarchical PRD: Player Movement System

## Overview
Implement a complete player movement system for a 2D platformer game, including ground movement, jumping, and physics integration.

## Version
2.0 (Hierarchical)

## Target Branch
feature/player-movement-system

## Global Validation

### Commands by Level
- **subtask**: `echo "Unity compile check"`
- **task**: `unity -batchmode -runTests -testPlatform EditMode`
- **story**: `unity -batchmode -runTests -testPlatform PlayMode`
- **feature**: `unity -batchmode -runTests`
- **epic**: `unity -batchmode -runTests && unity -batchmode -buildTarget StandaloneWindows64`

### Criteria by Level
- **subtask**: Code compiles in Unity
- **task**: Edit mode tests pass
- **story**: Play mode tests pass
- **feature**: All feature tests pass
- **epic**: Build succeeds, all tests pass

## Interfaces

### IMovable
- **Methods:** Move(direction: Vector2), Stop()
- **Properties:** IsMoving: bool, Velocity: Vector2

### IGroundChecker
- **Methods:** CheckGround(): bool
- **Properties:** IsGrounded: bool, GroundNormal: Vector2

### IJumpable
- **Methods:** Jump(), CancelJump()
- **Properties:** IsJumping: bool, JumpVelocity: float

## Work Breakdown

### E-001: Player Movement System
**Description:** Complete player movement with ground movement, jumping, and physics
**Validation:** ["unity -batchmode -runTests", "unity -batchmode -buildTarget StandaloneWindows64"]
**Criteria:** ["All tests pass", "Build succeeds"]

#### F-001.1: Ground Movement
**Description:** Horizontal movement on ground surfaces
**Component:** PlayerGroundMovement
**Provides:** [IMovable]
**Requires:** [{interface: IGroundChecker, providedBy: F-001.2}]
**Validation:** ["unity -batchmode -runTests -testFilter GroundMovement"]

##### S-001.1.1: Basic Movement Implementation
**Description:** As a player, I want to move left and right using input keys
**Acceptance Criteria:**
- [ ] A/D or arrow keys move character horizontally
- [ ] Movement speed is configurable
- [ ] Character faces movement direction
**Validation:** ["unity -runTests -testPlatform PlayMode -testFilter BasicMovement"]

###### T-001.1.1.1: Input Handling
**Description:** Connect input system to movement logic
**Validation:** ["unity -runTests -testPlatform EditMode -testFilter Input"]

####### ST-001.1.1.1.1: Create InputReader Component
**Description:** Create MonoBehaviour that reads horizontal input
**Validation:** ["echo Unity compile"]

####### ST-001.1.1.1.2: Wire Input to Movement
**Description:** Connect InputReader output to movement velocity
**Validation:** ["echo Unity compile"]

###### T-001.1.1.2: Physics Movement
**Description:** Apply movement using Rigidbody2D
**Validation:** ["unity -runTests -testPlatform EditMode -testFilter Physics"]

####### ST-001.1.1.2.1: Configure Rigidbody2D
**Description:** Set up Rigidbody2D with appropriate settings
**Validation:** ["echo Unity compile"]

#### F-001.2: Ground Detection
**Description:** Detect when player is touching ground
**Component:** GroundChecker
**Provides:** [IGroundChecker]
**Validation:** ["unity -runTests -testFilter GroundChecker"]

##### S-001.2.1: Raycast Ground Check
**Description:** As the system, I need to know when player is grounded
**Acceptance Criteria:**
- [ ] Raycast detects ground layers
- [ ] Ground normal is calculated
- [ ] IsGrounded updates each frame
**Validation:** ["unity -runTests -testPlatform PlayMode -testFilter GroundCheck"]

#### F-001.3: Jump System
**Description:** Player jumping mechanics
**Component:** PlayerJump
**Provides:** [IJumpable]
**Requires:** [{interface: IGroundChecker, providedBy: F-001.2}]
**Validation:** ["unity -runTests -testFilter Jump"]

##### S-001.3.1: Basic Jump
**Description:** As a player, I want to jump when pressing space while grounded
**Acceptance Criteria:**
- [ ] Space key triggers jump
- [ ] Jump only works when grounded
- [ ] Jump height is configurable
**Validation:** ["unity -runTests -testPlatform PlayMode -testFilter BasicJump"]

## Integration Contracts

### Movement-GroundCheck Contract
**Participants:**
- F-001.1 (consumer: IGroundChecker)
- F-001.2 (provider: IGroundChecker)
**Test Scenarios:**
1. Movement respects ground state
2. Slopes affect movement direction

### Jump-GroundCheck Contract
**Participants:**
- F-001.3 (consumer: IGroundChecker)
- F-001.2 (provider: IGroundChecker)
**Test Scenarios:**
1. Jump only triggers when IsGrounded is true
2. IsGrounded becomes false after jump

[/HIERARCHICAL-PRD]

---

## Checklist

Before outputting the hierarchical PRD:

- [ ] Asked about feature scale/complexity
- [ ] Asked about validation commands (REQUIRED)
- [ ] Determined appropriate depth (not always 5 levels)
- [ ] ID format is correct (E-xxx, F-xxx.x, S-xxx.x.x, etc.)
- [ ] Each level has validation gate
- [ ] Interface contracts defined if features interact
- [ ] Acceptance criteria are verifiable
- [ ] PRD wrapped in `[HIERARCHICAL-PRD]...[/HIERARCHICAL-PRD]`
