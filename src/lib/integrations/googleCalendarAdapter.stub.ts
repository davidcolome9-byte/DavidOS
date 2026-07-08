import type { IntegrationAdapter } from './integrationTypes';
import { stubResult } from './integrationTypes';

export const googleCalendarAdapter: IntegrationAdapter = {
  id: 'google_calendar',
  name: 'Google Calendar',
  capabilities: ['List events', 'Find availability', 'Create/update events (with approval)'],
  requiredCredentials: ['Google OAuth (PKCE) with calendar.events scope'],
  riskLevel: 'external_write',
  enabled: false,
  methods: [
    { name: 'listEvents', description: 'List upcoming events', risk: 'read_only', implemented: false },
    { name: 'findAvailability', description: 'Find open time blocks', risk: 'read_only', implemented: false },
    { name: 'createEvent', description: 'Create a calendar event', risk: 'external_write', implemented: false },
    { name: 'updateEvent', description: 'Update a calendar event', risk: 'external_write', implemented: false },
    { name: 'deleteEvent', description: 'Delete a calendar event', risk: 'sensitive_external_write', implemented: false },
  ],
  futureNotes:
    'Planned for v0.4, read-only first. Every create/update/delete asks for approval ' +
    'per event — no bulk silent edits.',
};

export const listEvents = () => stubResult(googleCalendarAdapter, 'listEvents');
export const findAvailability = () => stubResult(googleCalendarAdapter, 'findAvailability');
export const createEvent = () => stubResult(googleCalendarAdapter, 'createEvent');
export const updateEvent = () => stubResult(googleCalendarAdapter, 'updateEvent');
export const deleteEvent = () => stubResult(googleCalendarAdapter, 'deleteEvent');
