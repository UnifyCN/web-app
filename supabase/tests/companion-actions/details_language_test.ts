// Saved-detail command language (mobile-app#370 corrections S370-2, S370-3), through the
// public request boundary against the real local stack: the user's saved message is
// interpreted by the service and the resolved operation is applied with that message as
// authorization. The grammar stays the documented, deterministic one (commands.ts,
// profileFacts.ts); these cases bind its boundaries, not a general language parser.
import { assertEquals } from 'jsr:@std/assert@1';
import { apply, command, detailCreate, detailRows, interpret, newAccount, ready, said, testOpts } from './support.ts';

await ready();

/** What each supported locale's own help example must save. A new locale must add one. */
const HELP_EXAMPLE_SAVES: Record<string, string> = {
  en: 'I can attend appointments on Fridays',
  ar: 'أنا أستطيع حضور المواعيد يوم الجمعة',
  es: 'puedo ir a citas los viernes',
  'fr-CA': 'je peux aller aux rendez-vous le vendredi',
  hi: 'मैं शुक्रवार को अपॉइंटमेंट पर जा सकता हूँ',
  pa: 'ਮੈਂ ਸ਼ੁੱਕਰਵਾਰ ਨੂੰ ਅਪੌਇੰਟਮੈਂਟ ਉੱਤੇ ਜਾ ਸਕਦਾ ਹਾਂ',
  vi: 'tôi có thể đi hẹn vào thứ Sáu',
};
const LOCALES = new URL('../../../lib/i18n/locales/', import.meta.url);

/** The example command quoted in a locale's own "what should I remember?" help. */
function helpExample(locale: string): string {
  const t = JSON.parse(Deno.readTextFileSync(new URL(`${locale}/translation.json`, LOCALES))).savedDetails;
  const quoted = (s: string) => {
    const m = s.match(/[«“]\s*([^«»“”]+?)\s*[»”]/u);
    if (!m) throw new Error(`${locale}: no quoted example in "${s}"`);
    return m[1];
  };
  const example = quoted(t.clarifyMissing);
  assertEquals(quoted(t.clarifyUnclear), example, `${locale}: the two help strings give different examples`);
  return example;
}

async function interpreted(a: Awaited<ReturnType<typeof newAccount>>, text: string) {
  const m = await said(a, text);
  const i = await interpret(a, m.message_id);
  assertEquals(i.status, 200, JSON.stringify(i.json));
  const c = i.json.command;
  const got = c.kind === 'remember' ? { kind: 'remember', text: c.operation.text }
    : c.kind === 'remember_clarify' ? { kind: c.kind, reason: c.reason }
    : c.kind === 'profile_fact' ? { kind: c.kind, field: c.field } : { kind: c.kind };
  return { m, command: c, got };
}

Deno.test({
  name: 'S370-3: every locale’s own help example saves its whole first-person detail',
  ...testOpts,
  fn: async () => {
    // Wrong if: a help example the app shows does not resolve to a save, saves a broken or
    // shortened statement (the Arabic "ني …" left after cutting أن from أنني), or loses
    // who the detail is about.
    const dirs = [...Deno.readDirSync(LOCALES)].filter(e => e.isDirectory).map(e => e.name).sort();
    assertEquals(dirs, Object.keys(HELP_EXAMPLE_SAVES).sort(), 'a locale has no expected help-example save');
    const a = await newAccount('details-help-examples');
    for (const locale of dirs) {
      const { m, command: c, got } = await interpreted(a, helpExample(locale));
      assertEquals(got, { kind: 'remember', text: HELP_EXAMPLE_SAVES[locale] }, locale);
      const w = await apply(a, [c.operation], { authorization: command(m.message_id) });
      assertEquals(w.status, 200, `${locale}: ${JSON.stringify(w.json)}`);
      assertEquals(w.json.receipt.detail.text, HELP_EXAMPLE_SAVES[locale], locale);
    }
    assertEquals((await detailRows(a.id)).map(r => r.body), dirs.map(l => HELP_EXAMPLE_SAVES[l]));
  },
});

// Arabic attaches the subject pronoun to أن ("that"). First person keeps its pronoun as a
// separate word; another attached person is unclear rather than cut.
const ARABIC: [string, unknown][] = [
  ['تذكر أنني نباتي', { kind: 'remember', text: 'أنا نباتي' }],
  ['تذكّر أنّني أفضّل المواعيد الصباحية.', { kind: 'remember', text: 'أنا أفضّل المواعيد الصباحية' }],
  ['تذكر انني أستطيع الحضور يوم السبت', { kind: 'remember', text: 'أنا أستطيع الحضور يوم السبت' }],
  ['تذكر أني أحتاج إلى مترجم', { kind: 'remember', text: 'أنا أحتاج إلى مترجم' }],
  ['تذكر أننا نفضل المواعيد المسائية', { kind: 'remember', text: 'نحن نفضل المواعيد المسائية' }],
  ['تذكر أن مواعيدي المفضلة يوم الجمعة', { kind: 'remember', text: 'مواعيدي المفضلة يوم الجمعة' }],
  ['تذكر: مواعيدي المفضلة يوم الجمعة', { kind: 'remember', text: 'مواعيدي المفضلة يوم الجمعة' }],
  ['تذكر أنه يجب أن أحضر يوم الجمعة', { kind: 'remember_clarify', reason: 'unclear_reference' }],
  ['تذكر أنها تفضل المواعيد الصباحية', { kind: 'remember_clarify', reason: 'unclear_reference' }],
  ['تذكر أنني', { kind: 'remember_clarify', reason: 'missing_detail' }],
  ['تذكر ذلك', { kind: 'remember_clarify', reason: 'unclear_reference' }],
  ['هل تتذكر ما قلته؟', { kind: 'none' }],
];

Deno.test({
  name: 'S370-3: Arabic attached first-person forms keep their meaning; other attached forms ask',
  ...testOpts,
  fn: async () => {
    const a = await newAccount('details-arabic');
    for (const [text, want] of ARABIC) assertEquals((await interpreted(a, text)).got, want, text);
    assertEquals(await detailRows(a.id), []);
  },
});

// A status word used for something else (an appointment, an application) is not a
// statement of the user's status; a statement that the user is or holds one is.
const NEEDS: [string, string][] = [
  ['Remember that I need an interpreter for work permit appointments', 'I need an interpreter for work permit appointments'],
  ['Remember that I need help with my study permit application', 'I need help with my study permit application'],
  ['Souviens-toi que j’ai besoin d’un interprète pour les rendez-vous de permis de travail', 'j’ai besoin d’un interprète pour les rendez-vous de permis de travail'],
  ['Recuerda que necesito un intérprete para las citas del permiso de trabajo', 'necesito un intérprete para las citas del permiso de trabajo'],
  ['Hãy nhớ rằng tôi cần phiên dịch cho các cuộc hẹn về giấy phép lao động', 'tôi cần phiên dịch cho các cuộc hẹn về giấy phép lao động'],
  ['याद रखें कि मुझे वर्क परमिट अपॉइंटमेंट के लिए दुभाषिया चाहिए', 'मुझे वर्क परमिट अपॉइंटमेंट के लिए दुभाषिया चाहिए'],
  ['ਯਾਦ ਰੱਖੋ ਕਿ ਮੈਨੂੰ ਵਰਕ ਪਰਮਿਟ ਅਪੌਇੰਟਮੈਂਟ ਲਈ ਦੁਭਾਸ਼ੀਏ ਦੀ ਲੋੜ ਹੈ', 'ਮੈਨੂੰ ਵਰਕ ਪਰਮਿਟ ਅਪੌਇੰਟਮੈਂਟ ਲਈ ਦੁਭਾਸ਼ੀਏ ਦੀ ਲੋੜ ਹੈ'],
  ['تذكر أنني أحتاج إلى مترجم لمواعيد تصريح عمل', 'أنا أحتاج إلى مترجم لمواعيد تصريح عمل'],
];
const STATUSES = [
  'Remember that I am a permanent resident',
  'Remember that I’m on a work permit',
  'Remember that I have a study permit',
  'Remember: I’m a refugee claimant',
  'Remember that my immigration status is pending',
  'Remember: permanent resident',
  'Souviens-toi que je suis résident permanent',
  'Souviens-toi que j’ai un permis de travail',
  'Recuerda que soy residente permanente',
  'Recuerda que tengo permiso de trabajo',
  'Hãy nhớ rằng tôi là thường trú nhân',
  'Hãy nhớ rằng tôi có giấy phép lao động',
  'याद रखें कि मैं स्थायी निवासी हूँ',
  'याद रखें कि मेरे पास वर्क परमिट है',
  'ਯਾਦ ਰੱਖੋ ਕਿ ਮੈਂ ਪੱਕਾ ਨਿਵਾਸੀ ਹਾਂ',
  'ਯਾਦ ਰੱਖੋ ਕਿ ਮੇਰੇ ਕੋਲ ਵਰਕ ਪਰਮਿਟ ਹੈ',
  'تذكر أنني لاجئ',
  'تذكر أن لدي تصريح عمل',
];

Deno.test({
  name: 'S370-2: a need that mentions a permit is saved; a statement of status stays with the profile',
  ...testOpts,
  fn: async () => {
    // Wrong if: the clear interpreter need is refused as an immigration status (HTTP 422,
    // nothing saved), any other language's need is refused, or a true status statement in
    // any language resolves to a save or is saved by a direct apply.
    const a = await newAccount('details-status');
    const repro = await interpreted(a, NEEDS[0][0]);
    assertEquals(repro.got, { kind: 'remember', text: NEEDS[0][1] });
    const w = await apply(a, [repro.command.operation], { authorization: command(repro.m.message_id) });
    assertEquals(w.status, 200, JSON.stringify(w.json));
    assertEquals((await detailRows(a.id)).map(r => r.body), [NEEDS[0][1]]);

    for (const [text, saved] of NEEDS.slice(1)) assertEquals((await interpreted(a, text)).got, { kind: 'remember', text: saved }, text);
    for (const text of STATUSES) assertEquals((await interpreted(a, text)).got, { kind: 'profile_fact', field: 'persona' }, text);

    // The edge refuses a status statement however it arrives.
    const m = await said(a, 'Remember that I have a work permit');
    const refused = await apply(a, [detailCreate('I have a work permit')], { authorization: command(m.message_id) });
    assertEquals([refused.status, refused.json.reason, refused.json.detail], [422, 'profile_fact', { field: 'persona' }], JSON.stringify(refused.json));
    assertEquals((await detailRows(a.id)).map(r => r.body), [NEEDS[0][1]]);
  },
});
