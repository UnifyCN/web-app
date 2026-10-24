import { beforeEach, expect, test, vi } from 'vitest';
import { highlightRangeMatches } from './highlightRange';
const db = vi.hoisted(() => ({from: vi.fn(), rpc: vi.fn()}));
vi.mock('@/lib/supabase/client', () => ({createClient: () => db, getAuthUserId: async () => 'user', isSupabaseConfigured: () => true}));
import { saveHighlight, type Highlight } from '@/services/highlights';
const row = {id:'stored', lessonId:'lesson', pageKey:'page', blockKey:'block', startWordIndex:0,endWordIndex:1, selectedText:'monthly costs'} as Highlight;
beforeEach(() => vi.clearAllMocks());
test('saved text must still match its range', () => {
  expect(highlightRangeMatches(['travel','needs.'],0,1,'monthly costs')).toBe(false);
  expect(highlightRangeMatches(['monthly','costs'],0,1,'monthly\n costs')).toBe(true);
  expect(highlightRangeMatches(['costs'],0,4,'costs')).toBe(false);
});
test('stale overlap is retained instead of merged or deleted', async () => {
  const insert = vi.fn().mockReturnValue({select: () => ({single: async () => ({data:{id:'new'},error:null})})});
  db.from.mockReturnValue({insert});
  await saveHighlight({lessonId:'lesson',pageKey:'page',blockKey:'block',startWordIndex:1,endWordIndex:1,selectedText:'needs.',existingHighlights:[row],allWordsInBlock:['travel','needs.']});
  expect(db.rpc).not.toHaveBeenCalled();
  expect(insert).toHaveBeenCalledWith(expect.objectContaining({selected_text:'needs.',start_word_index:1,end_word_index:1}));
});
test('matching overlap still merges', async () => {
  db.rpc.mockResolvedValue({data:{id:'merged'},error:null});
  await saveHighlight({lessonId:'lesson',pageKey:'page',blockKey:'block',startWordIndex:1,endWordIndex:2,selectedText:'costs vary',existingHighlights:[row],allWordsInBlock:['monthly','costs','vary']});
  expect(db.rpc).toHaveBeenCalledWith('merge_highlights',expect.objectContaining({p_ids_to_delete:['stored'],p_selected_text:'monthly costs vary'}));
});
test('changed selection is rejected without a write', async () => {
  await expect(saveHighlight({lessonId:'lesson',pageKey:'page',blockKey:'block',startWordIndex:0,endWordIndex:1,selectedText:'monthly costs',existingHighlights:[],allWordsInBlock:['travel','needs.']})).rejects.toThrow();
  expect(db.from).not.toHaveBeenCalled();expect(db.rpc).not.toHaveBeenCalled();
});
