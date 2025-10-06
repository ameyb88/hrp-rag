# Incident Severity & Response Playbook

This playbook defines severity levels, examples, and the response process. Use it to declare, triage, communicate, and resolve incidents.

## Severity levels

**Sev-1 (Critical, P0)**

- **Impact**: Complete outage or data corruption impacting the majority of users. No workaround.
- **Targets**: Initial response ≤ **5 min**, mitigation ≤ **30 min**, resolution ASAP.
- **Examples**: Production down, widespread unauthorized access, critical data loss.

**Sev-2 (High, P1)**

- **Impact**: Major functionality broken for many users; partial outage. Workaround may exist.
- **Targets**: Initial response ≤ **15 min**, mitigation ≤ **2 hr**.
- **Examples**: Payment failures for a region, persistent 5xx for key API paths.

**Sev-3 (Medium, P2)**

- **Impact**: Degraded performance or feature impairment with limited scope.
- **Targets**: Initial response ≤ **1 hr**, mitigation ≤ **8 hr**.
- **Examples**: Slow dashboards, one integration failing for some tenants.

**Sev-4 (Low, P3)**

- **Impact**: Minor bug, visual issue, or non-blocking task.
- **Targets**: Initial triage ≤ **1 business day**.
- **Examples**: Copy typos, styling defects, non-critical job retries.

## Roles

- **Incident Commander (IC)**: Owns timeline, decisions, and comms.
- **Tech Lead (TL)**: Leads diagnosis/mitigation.
- **Comms**: Posts updates to stakeholders on the declared cadence.
- **Scribe**: Captures actions, timestamps, and outcomes.

## Declaring an incident (IC)

1. **Assess** impact & scope; pick **Sev-1..Sev-4** from definitions above.
2. **Create** an incident ticket with title, severity, start time, symptoms, suspected area.
3. **Announce** in `#incident-room` with `[Sev-X] Title – Start: HH:MM UTC – IC @name`.
4. **Open** a bridge if Sev-1/Sev-2; invite TL + responders.

## Mitigation & comms

- **Mitigate first** (stop the bleeding), then root cause.
- **Comms cadence**:
  - Sev-1: every **15 min**
  - Sev-2: every **30 min**
  - Sev-3: every **2 hr**
  - Sev-4: daily or on resolution
- Include **status, hypothesis, actions, next update time**.

## Resolution & follow-up

1. **Resolve** once impact is eliminated; record end time.
2. **Document** timeline, root cause, contributing factors, and corrective actions.
3. **Lessons Learned** within **5 business days** (Sev-1/Sev-2), or as needed for Sev-3/4.

## Quick reference (cheat-sheet)

- **Sev-1**: outage/critical data → respond ≤5 min, mitigate ≤30 min.
- **Sev-2**: major feature broken → respond ≤15 min, mitigate ≤2 hr.
- **Sev-3**: degradation/limited scope → respond ≤1 hr, mitigate ≤8 hr.
- **Sev-4**: minor defect → triage ≤1 business day.
