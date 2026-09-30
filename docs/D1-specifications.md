# D1: Specifications

> Initial specification — may be revised after further client feedback. Canonical copy is on the COMP 523 project hub.

## Personas

- **Alex — Administrator.** Manages classroom assignments each semester. Wants one view of courses, rooms, schedules, and conflicts; today the information is spread across 25Live and Google Calendars.
- **Casey — Faculty/Instructor.** Needs accurate, current room and meeting time for their course, including after last-minute changes.
- **Sam — Scheduling Coordinator.** Compares enrollment, room capacity, availability, and times; wants to try assignments visually before committing.

## User stories

**Alex**
- View course schedules and classroom assignments in one place.
- Have assignment changes sync to the department Google Calendar.
- See when classroom information was last synchronized.
- Have scheduling conflicts flagged.
- Update a classroom assignment from the scheduling interface.

**Casey**
- View my course's current classroom and meeting time.
- See classroom changes on the department calendar.
- See updated classroom information after a last-minute change.

**Sam**
- See courses alongside available rooms, capacities, and expected enrollment.
- Have rooms that are too small flagged.
- See room availability by day and time.
- Move a course to a different room or time in the interface.
- See conflicts immediately when moving a course, before saving.
- View the overall classroom schedule visually.

## Functional requirements

| ID | Priority | Requirement |
| --- | --- | --- |
| FR-1 | Definite | Course and classroom data: course, meeting time, room, expected enrollment, room capacity |
| FR-2 | Definite | Classroom availability for a selected date and time |
| FR-3 | Definite | Visual schedule by day and time |
| FR-4 | Definite | Authorized admins can assign or change a course's classroom |
| FR-5 | Definite | Conflict detection (e.g. two courses in one room at the same time) |
| FR-6 | Definite | Capacity validation (room smaller than expected enrollment) |
| FR-7 | Definite | Google Calendar synchronization, within API capabilities/permissions |
| FR-8 | Definite | Assignment changes update schedule data and the connected calendar |
| FR-9 | Definite | Refresh data from connected external systems |
| FR-10 | Perhaps | 25Live integration if an API/interface is available |
| FR-11 | Perhaps | Interactive editing with immediate conflict feedback |
| FR-12 | Perhaps | Filter by course, room, day, time, etc. |
| FR-13 | Perhaps | Change history |
| FR-14 | Improbable | Automated room suggestions |
| FR-15 | Improbable | Automated course scheduling |
| FR-16 | Improbable | Multi-semester scheduling |

## Non-functional requirements

| ID | Priority | Requirement |
| --- | --- | --- |
| NFR-1 | Definite | Usability: no need to inspect multiple external systems |
| NFR-2 | Definite | Runs in a standard modern browser |
| NFR-3 | Definite | Reliability: no data loss on temporary connection failure |
| NFR-4 | Definite | Distinguish local data from externally retrieved data |
| NFR-5 | Definite | Understandable error messages |
| NFR-6 | Definite | Only authorized users can modify assignments or sync |
| NFR-7 | Perhaps | Results within a few seconds |
| NFR-8 | Perhaps | Scales to the department's courses/rooms |
| NFR-9 | Perhaps | Audit log of scheduling and sync operations |
| NFR-10 | Improbable | Continued access during external service outages |

## Interfaces

| ID | Priority | Interface |
| --- | --- | --- |
| I-1 | Definite | Web GUI |
| I-2 | Definite | Calendar/timeline schedule view |
| I-3 | Definite | Google Calendar API |
| I-4 | Definite | 25Live interface, if access is provided |
| I-5 | Definite | User authentication |
| I-6 | Perhaps | Drag-and-drop scheduling |
| I-7 | Perhaps | Visual conflict/capacity/unavailable indicators |
| I-8 | Perhaps | Synchronization status display |
| I-9 | Improbable | Edit in Google Calendar and propagate back |
| I-10 | Improbable | Advanced 25Live editing |
