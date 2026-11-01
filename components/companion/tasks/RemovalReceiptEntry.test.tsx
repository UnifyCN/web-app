// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { it, expect, vi } from 'vitest';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import en from '@/lib/i18n/locales/en/translation.json';
import { TaskActionCards } from '@/components/companion/tasks/TaskActionCards';
import type { RemovalProposal } from '@/lib/companionActions/contract';

vi.mock('@/hooks/useTaskActions', () => ({
  useTaskActionPhase: () => ({ phase: 'idle' }),
  useTaskProgress: () => ({ status: 'ready', byRef: new Map() }),
}));

const proposal: RemovalProposal = {
  proposalId: 'removal-review', proposalRevision: 1, status: 'draft',
  operation: { type: 'task.remove', task_ref: 'custom:1', expected_revision: 3 },
  effects: { taskRef: 'custom:1', title: 'Get a phone plan', state: 'not_started',
    revision: 3, removed: false, plans: [], stepsTotal: 2, remindersPending: 0 },
  previousEffects: null, reviewReason: null,
  source: { conversationId: 'conversation-1', messageId: 77 }, receipt: null,
};

it('opens the current task receipt from a removed-task card after reload without requesting another removal', () => {
  const view = vi.fn();
  const review = vi.fn();
  const i18n = createInstance();
  void i18n.use(initReactI18next).init({ lng: 'en', resources: { en: { translation: en } },
    interpolation: { escapeValue: false }, initImmediate: false });
  render(<I18nextProvider i18n={i18n}>
    <TaskActionCards message={{ id: 77, role: 'user', content: 'Remove task: Get a phone plan', conversationId: 'conversation-1', sources: null, createdAt: '2026-10-29T00:00:00Z' }} proposals={[]} commands={[]} store={null}
      canWrite={false} onReview={vi.fn()} onViewTask={view}
      removalProposals={[proposal]} onReviewRemoval={review} isRemovedNow={() => true} />
  </I18nextProvider>);
  expect(screen.queryByRole('button', { name: 'Review removal of Get a phone plan' })).toBeNull();
  expect(view).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'View task' }));
  expect(view).toHaveBeenCalledWith('custom:1');
  expect(review).not.toHaveBeenCalled();
});
