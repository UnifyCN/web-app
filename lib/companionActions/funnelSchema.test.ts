import { expect, it } from 'vitest';
import config from '@/docs/companion-actions/373-funnel.json';
import { buildPlanResultProperties, buildTaskActionResultProperties } from './analytics';
it('the inspectable funnel accepts only existing categorical metadata and drops private fields', () => {
  const privateFields = { message: 'PRIVATE_MESSAGE', title: 'PRIVATE_TITLE', reminder_note:'PRIVATE_NOTE', saved_detail:'PRIVATE_DETAIL' };
  const events = [
    buildPlanResultProperties({action:'approve_plan',outcome:'applied',changeCount:1,...privateFields},'companion'),
    buildPlanResultProperties({action:'lookup',outcome:'replayed',...privateFields},'companion'),
    buildTaskActionResultProperties({action:'set_state',outcome:'conflict',...privateFields},'checklist'),
  ];
  expect(events.every(Boolean)).toBe(true);
  for(const event of events) {
    expect(Object.keys(event! ).every(k=>config.properties.includes(k))).toBe(true);
    expect(JSON.stringify(event)).not.toContain('PRIVATE_');
  }
  expect(config.stages.resume_lookup.action).toContain('lookup');
  expect(config.stages.conflict.outcome).toContain('conflict');
});
