import { afterEach, expect, it, vi } from 'vitest';
import { noteAccount, ownAccountWork } from '@/lib/accountSession';
const stub = vi.hoisted(() => ({ rpc: vi.fn(), user: 'allowance-a' }));
vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: () => true,
  getAuthUserId: async () => stub.user,
  createClient: () => ({ rpc: stub.rpc, from: () => { throw Error('client quota read'); } }),
}));
import { getChatbotUsage } from './companion';
afterEach(() => vi.clearAllMocks());
it('reads the server allowance unchanged despite a different client day', async () => {
  noteAccount(stub.user);
  stub.rpc.mockResolvedValue({ data: { message_count: 5, last_message_at: null, daily_limit: 6, remaining: 1, is_premium: false, resets_at: '2026-11-02T00:00:00+00:00', observed_at: '2026-11-01T23:59:59+00:00' }, error: null });
  const result = await getChatbotUsage(ownAccountWork());
  expect(result).toMatchObject({ messageCount: 5, remaining: 1, dailyLimit: 6, isPremium: false, resetsAt: '2026-11-02T00:00:00+00:00' });
  expect(stub.rpc).toHaveBeenCalledWith('get_chatbot_allowance');
});
it('fails closed on an unavailable allowance and rejects a late account result', async () => {
  noteAccount(stub.user);
  stub.rpc.mockResolvedValueOnce({ data: null, error: Error('offline') });
  await expect(getChatbotUsage(ownAccountWork())).rejects.toThrow('offline');
  const owner = ownAccountWork();
  stub.rpc.mockImplementationOnce(async () => { noteAccount('allowance-b'); return { data: { message_count: 0, daily_limit: 6, remaining: 6, is_premium: false, resets_at: '2026-11-02T00:00:00Z', observed_at: '2026-11-01T12:00:00Z' }, error: null }; });
  await expect(getChatbotUsage(owner)).rejects.toThrow('account');
});
