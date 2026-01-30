/**
 * ABOUTME: 내장 프롬프트 템플릿 (임베디드 문자열).
 * 이 템플릿들은 패키지에 번들되어 기본값으로 사용됩니다.
 */

/**
 * 기본 템플릿 - 트래커별 템플릿이 없을 때 사용됩니다.
 */
export const DEFAULT_TEMPLATE = `## 작업
**ID**: {{taskId}}
**제목**: {{taskTitle}}

{{#if taskDescription}}
## 설명
{{taskDescription}}
{{/if}}

{{#if acceptanceCriteria}}
## 완료 조건
{{acceptanceCriteria}}
{{/if}}

{{#if labels}}
**라벨**: {{labels}}
{{/if}}

{{#if dependsOn}}
**의존성**: {{dependsOn}}
{{/if}}

{{#if recentProgress}}
## 이전 진행 상황
{{recentProgress}}
{{/if}}

## 지침
위에 설명된 작업을 완료하세요.

**중요**: 작업이 이미 완료된 경우(이전 반복에서 구현되었거나 이미 존재하는 경우), 정상 작동을 확인하고 즉시 완료 신호를 보내세요.

완료되면 (또는 이미 완료된 경우) 다음으로 완료 신호를 보내세요:
<promise>COMPLETE</promise>
`;

/**
 * Beads 트래커 템플릿 - bead 기반 워크플로우에 최적화.
 * 컨텍스트 우선 구조: PRD → 패턴 → 작업 → 워크플로우
 */
export const BEADS_TEMPLATE = `{{!-- 프로젝트 컨텍스트를 위한 전체 PRD (에이전트가 먼저 학습) --}}
{{#if prdContent}}
## PRD: {{prdName}}
{{#if prdDescription}}
{{prdDescription}}
{{/if}}

### 진행률: {{prdCompletedCount}}/{{prdTotalCount}} 작업 완료

<details>
<summary>전체 PRD 문서 (클릭하여 펼치기)</summary>

{{prdContent}}

</details>
{{/if}}

{{!-- 이전 반복에서 배운 것들 (패턴 우선) --}}
{{#if codebasePatterns}}
## 코드베이스 패턴 (먼저 학습하세요)
{{codebasePatterns}}
{{/if}}

## Bead 상세
- **ID**: {{taskId}}
- **제목**: {{taskTitle}}
{{#if epicId}}
- **에픽**: {{epicId}}{{#if epicTitle}} - {{epicTitle}}{{/if}}
{{/if}}
{{#if taskDescription}}
- **설명**: {{taskDescription}}
{{/if}}

{{#if acceptanceCriteria}}
## 완료 조건
{{acceptanceCriteria}}
{{/if}}

{{#if dependsOn}}
**선행 조건**: {{dependsOn}}
{{/if}}

{{#if recentProgress}}
## 최근 진행 상황
{{recentProgress}}
{{/if}}

## 워크플로우
1. 위의 PRD 컨텍스트를 학습하여 전체 그림을 이해하세요 (가능한 경우)
2. \`.ralph-tui/progress.md\`를 학습하여 전체 상태, 구현 진행 상황, 코드베이스 패턴과 주의사항을 포함한 배운 점을 파악하세요
3. 요구사항을 구현하세요 (현재 브랜치에서 작업)
4. 프로젝트의 품질 검사를 실행하세요 (타입체크, 린트 등)
{{#if config.autoCommit}}
5. git 커밋을 생성하지 마세요. 작업 완료 후 엔진이 자동으로 커밋합니다.
{{else}}
5. git 커밋을 생성하지 마세요. 수동 검토를 위해 모든 변경사항을 커밋하지 않은 상태로 두세요.
{{/if}}
6. bead를 닫으세요: \`bd close {{taskId}} --db {{beadsDbPath}} --reason "간단한 설명"\`
7. 배운 점을 문서화하세요 (아래 참조)
8. 완료 신호를 보내세요

## 완료 전
\`.ralph-tui/progress.md\`에 추가하세요:
\`\`\`
## [날짜] - {{taskId}}
- 구현한 내용
- 변경된 파일
- **배운 점:**
  - 발견한 패턴
  - 겪은 주의사항
---
\`\`\`

**재사용 가능한 패턴**을 발견했다면, progress.md 상단의 \`## 코드베이스 패턴\` 섹션에도 추가하세요.

## 종료 조건
**중요**: 작업이 이미 완료된 경우(이전 반복에서 구현되었거나 이미 존재하는 경우), 정상 작동을 확인하고 즉시 완료 신호를 보내세요.

완료되면 (또는 이미 완료된 경우) 다음으로 완료 신호를 보내세요:
<promise>COMPLETE</promise>
`;

/**
 * Beads + bv 트래커 템플릿 - 지능적 선택의 추가 컨텍스트 포함.
 * 컨텍스트 우선 구조: PRD → 선택 컨텍스트 → 패턴 → 작업 → 워크플로우
 */
export const BEADS_BV_TEMPLATE = `{{!-- 프로젝트 컨텍스트를 위한 전체 PRD (에이전트가 먼저 학습) --}}
{{#if prdContent}}
## PRD: {{prdName}}
{{#if prdDescription}}
{{prdDescription}}
{{/if}}

### 진행률: {{prdCompletedCount}}/{{prdTotalCount}} 작업 완료

<details>
<summary>전체 PRD 문서 (클릭하여 펼치기)</summary>

{{prdContent}}

</details>
{{/if}}

{{!-- 이 작업이 선택된 이유 (bv 컨텍스트) --}}
{{#if selectionReason}}
## 이 작업이 선택된 이유
{{selectionReason}}
{{/if}}

{{!-- 이전 반복에서 배운 것들 (패턴 우선) --}}
{{#if codebasePatterns}}
## 코드베이스 패턴 (먼저 학습하세요)
{{codebasePatterns}}
{{/if}}

## Bead 상세
- **ID**: {{taskId}}
- **제목**: {{taskTitle}}
{{#if epicId}}
- **에픽**: {{epicId}}{{#if epicTitle}} - {{epicTitle}}{{/if}}
{{/if}}
{{#if taskDescription}}
- **설명**: {{taskDescription}}
{{/if}}

{{#if acceptanceCriteria}}
## 완료 조건
{{acceptanceCriteria}}
{{/if}}

{{#if dependsOn}}
## 의존성
이 작업은 다음에 의존합니다: {{dependsOn}}
{{/if}}

{{#if blocks}}
## 영향
이 작업을 완료하면 다음이 차단 해제됩니다: {{blocks}}
{{/if}}

{{#if recentProgress}}
## 최근 진행 상황
{{recentProgress}}
{{/if}}

## 워크플로우
1. 위의 PRD 컨텍스트를 학습하여 전체 그림을 이해하세요 (가능한 경우)
2. \`.ralph-tui/progress.md\`를 학습하여 전체 상태, 구현 진행 상황, 코드베이스 패턴과 주의사항을 포함한 배운 점을 파악하세요
3. 요구사항을 구현하세요 (현재 브랜치에서 작업)
4. 프로젝트의 품질 검사를 실행하세요 (타입체크, 린트 등)
{{#if config.autoCommit}}
5. git 커밋을 생성하지 마세요. 작업 완료 후 엔진이 자동으로 커밋합니다.
{{else}}
5. git 커밋을 생성하지 마세요. 수동 검토를 위해 모든 변경사항을 커밋하지 않은 상태로 두세요.
{{/if}}
6. bead를 닫으세요: \`bd close {{taskId}} --db {{beadsDbPath}} --reason "간단한 설명"\`
7. 배운 점을 문서화하세요 (아래 참조)
8. 완료 신호를 보내세요

## 완료 전
\`.ralph-tui/progress.md\`에 추가하세요:
\`\`\`
## [날짜] - {{taskId}}
- 구현한 내용
- 변경된 파일
- **배운 점:**
  - 발견한 패턴
  - 겪은 주의사항
---
\`\`\`

**재사용 가능한 패턴**을 발견했다면, progress.md 상단의 \`## 코드베이스 패턴\` 섹션에도 추가하세요.

## 종료 조건
**중요**: 작업이 이미 완료된 경우(이전 반복에서 구현되었거나 이미 존재하는 경우), 정상 작동을 확인하고 즉시 완료 신호를 보내세요.

완료되면 (또는 이미 완료된 경우) 다음으로 완료 신호를 보내세요:
<promise>COMPLETE</promise>
`;

/**
 * JSON (prd.json) 트래커 템플릿 - PRD 사용자 스토리용 구조화.
 * 컨텍스트 우선 구조: PRD → 패턴 → 작업 → 워크플로우
 */
export const JSON_TEMPLATE = `{{!-- 프로젝트 컨텍스트를 위한 전체 PRD (에이전트가 먼저 학습) --}}
{{#if prdContent}}
## PRD: {{prdName}}
{{#if prdDescription}}
{{prdDescription}}
{{/if}}

### 진행률: {{prdCompletedCount}}/{{prdTotalCount}} 스토리 완료

<details>
<summary>전체 PRD 문서 (클릭하여 펼치기)</summary>

{{prdContent}}

</details>
{{/if}}

{{!-- 이전 반복에서 배운 것들 (패턴 우선) --}}
{{#if codebasePatterns}}
## 코드베이스 패턴 (먼저 학습하세요)
{{codebasePatterns}}
{{/if}}

{{!-- 작업 상세 --}}
## 현재 작업: {{taskId}} - {{taskTitle}}

{{#if taskDescription}}
### 설명
{{taskDescription}}
{{/if}}

{{#if acceptanceCriteria}}
### 완료 조건
{{acceptanceCriteria}}
{{/if}}

{{#if notes}}
### 참고사항
{{notes}}
{{/if}}

{{#if dependsOn}}
**선행 조건**: {{dependsOn}}
{{/if}}

{{#if recentProgress}}
## 최근 진행 상황
{{recentProgress}}
{{/if}}

## 워크플로우
1. 위의 PRD 컨텍스트를 학습하여 전체 그림을 이해하세요
2. \`.ralph-tui/progress.md\`를 학습하여 전체 상태, 구현 진행 상황, 코드베이스 패턴과 주의사항을 포함한 배운 점을 파악하세요
3. 완료 조건을 따라 이 단일 스토리를 구현하세요
4. 품질 검사 실행: 타입체크, 린트 등
{{#if config.autoCommit}}
5. git 커밋을 생성하지 마세요. 작업 완료 후 엔진이 자동으로 커밋합니다.
{{else}}
5. git 커밋을 생성하지 마세요. 수동 검토를 위해 모든 변경사항을 커밋하지 않은 상태로 두세요.
{{/if}}
6. 배운 점을 문서화하세요 (아래 참조)
7. 완료 신호를 보내세요

## 완료 전
\`.ralph-tui/progress.md\`에 추가하세요:
\`\`\`
## [날짜] - {{taskId}}
- 구현한 내용
- 변경된 파일
- **배운 점:**
  - 발견한 패턴
  - 겪은 주의사항
---
\`\`\`

**재사용 가능한 패턴**을 발견했다면, progress.md 상단의 \`## 코드베이스 패턴\` 섹션에도 추가하세요.

## 종료 조건
**중요**: 작업이 이미 완료된 경우(이전 반복에서 구현되었거나 이미 존재하는 경우), 완료 조건을 충족하는지 확인하고 즉시 완료 신호를 보내세요.

완료되면 (또는 이미 완료된 경우) 다음으로 완료 신호를 보내세요:
<promise>COMPLETE</promise>
`;

/**
 * 계층적 JSON 트래커 템플릿 - 5단계 계층 작업 분해용.
 * 컨텍스트 우선 구조: 부모 컨텍스트 → 작업 상세 → 검증 게이트 → 워크플로우
 */
export const HIERARCHICAL_JSON_TEMPLATE = `{{!-- 작업 항목 상세 --}}
## 현재 작업: {{taskId}} - {{taskTitle}}

**유형:** {{workItemType}} | **깊이:** {{depth}} | **우선순위:** {{priority}}

{{#if parentContext}}
### 부모 컨텍스트
- **부모:** {{parentContext.title}} ({{parentContext.id}})
{{#if grandparentContext}}
- **조부모:** {{grandparentContext.title}} ({{grandparentContext.id}})
{{/if}}
{{/if}}

{{#if taskDescription}}
### 설명
{{taskDescription}}
{{/if}}

{{#if acceptanceCriteria}}
### 완료 조건
{{acceptanceCriteria}}
{{/if}}

{{#if componentSpec}}
### 인터페이스 계약
**컴포넌트:** {{componentSpec.name}}

{{#if componentSpec.provides}}
**제공:**
{{#each componentSpec.provides}}
- {{this}}
{{/each}}
{{/if}}

{{#if componentSpec.requires}}
**필요:**
{{#each componentSpec.requires}}
- {{interface}}{{#if providedBy}} ({{providedBy}}에서 제공){{/if}}
{{/each}}
{{/if}}
{{/if}}

{{#if siblingProgress}}
### 형제 진행률
완료: {{siblingProgress.completed}}/{{siblingProgress.total}}
{{/if}}

{{#if validationGate}}
## 검증 게이트
**유형:** {{validationGate.type}}

**검증 명령어:**
{{#each validationGate.commands}}
- \`{{this}}\`
{{/each}}

**통과 기준:**
{{#each validationGate.criteria}}
- {{this}}
{{/each}}
{{/if}}

{{#if recentProgress}}
## 최근 진행 상황
{{recentProgress}}
{{/if}}

## 워크플로우

1. **컨텍스트 이해**
   - 부모 작업 항목을 검토하여 더 넓은 컨텍스트 파악
   - 완료 조건을 주의 깊게 확인

2. **구현**
   - 위에 설명된 작업 완료
   - 프로젝트 코딩 표준 준수
   - 이 {{workItemType}}에 집중하여 변경

3. **검증**
   - 검증 명령어 실행
   - 모든 완료 조건 충족 확인

4. **커밋**
{{#if config.autoCommit}}
   - git 커밋을 생성하지 마세요. 작업 완료 후 엔진이 자동으로 커밋합니다.
{{else}}
   - git 커밋을 생성하지 마세요. 수동 검토를 위해 모든 변경사항을 커밋하지 않은 상태로 두세요.
{{/if}}

5. **완료 신호**
   - 완료되면: <promise>COMPLETE</promise>

{{#if notes}}
## 참고사항
{{notes}}
{{/if}}

## 종료 조건
**중요**: 작업이 이미 완료된 경우(이전 반복에서 구현되었거나 이미 존재하는 경우), 검증을 실행하고 즉시 완료 신호를 보내세요.

완료되면 (또는 이미 완료된 경우) 다음으로 완료 신호를 보내세요:
<promise>COMPLETE</promise>
`;
