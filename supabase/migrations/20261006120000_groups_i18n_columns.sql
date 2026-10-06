-- Group names and descriptions in every app language.
--
-- public.groups holds its text in English only (group_name, group_description),
-- so the Community list, post labels and group pages stayed in English in every
-- language on both apps. This adds two nullable jsonb columns that hold the
-- other six languages next to the English text:
--
--   name_i18n         {"fr-CA": "...", "vi": "...", "es": "...", "ar": "...", "hi": "...", "pa": "..."}
--   description_i18n  same shape
--
-- English stays in group_name / group_description. Readers take the entry for
-- the UI language and fall back to the English column when the column is null,
-- the language is missing, or the value is empty. A new group therefore works
-- with no translations at all.
--
-- ADDITIVE ONLY: two columns, two CHECK constraints, a backfill of the two new
-- columns on the 14 official groups. Nothing is dropped, renamed or retyped, and
-- group_name / group_description are not written.
--
-- ACCESS: nothing changes. public.groups has table-level grants (no column-level
-- grants, unlike public.users), so the new columns are readable by exactly the
-- roles that already read group_name. RLS has one policy, the world-readable
-- select ("Enable read access for all users", using (true)); there is no insert,
-- update or delete policy, so only the service role and the dashboard can write,
-- before and after. No grant and no policy is added here.
--
-- MOBILE: its group queries use select('*') and map the columns they need by
-- name, so two extra keys in the row are ignored. Mobile can show translations
-- with the same fallback: name_i18n->>lang, else group_name.
--
-- KEEP IN SYNC: when a group is renamed or its description rewritten, update or
-- clear its translations in the same statement; nothing invalidates them
-- automatically.
--
-- APPLY BY HAND in the SQL editor (`db push` is unsafe against the drifted
-- history). Re-runnable: `add column if not exists`, guarded constraints, and a
-- backfill that only matches a group whose id and English name are both the
-- expected ones.
--
-- ROLLBACK (drops the translations; the English columns are untouched):
--   alter table public.groups
--     drop column if exists name_i18n,
--     drop column if exists description_i18n;
--   notify pgrst, 'reload schema';

begin;

-- ----------------------------------------------------------------------------
-- 1) Columns
-- ----------------------------------------------------------------------------
alter table public.groups
  add column if not exists name_i18n jsonb,
  add column if not exists description_i18n jsonb;

comment on column public.groups.name_i18n is
  'Translated group names keyed by app language code ("fr-CA", "vi", "es", "ar", "hi", "pa"). English lives in group_name. Readers fall back to group_name.';
comment on column public.groups.description_i18n is
  'Translated group descriptions keyed by app language code. English lives in group_description. Readers fall back to group_description.';

-- ----------------------------------------------------------------------------
-- 2) Each column is a JSON object or null (a CHECK passes on null)
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.groups'::regclass and conname = 'groups_name_i18n_is_object'
  ) then
    alter table public.groups
      add constraint groups_name_i18n_is_object
      check (jsonb_typeof(name_i18n) = 'object');
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.groups'::regclass and conname = 'groups_description_i18n_is_object'
  ) then
    alter table public.groups
      add constraint groups_description_i18n_is_object
      check (jsonb_typeof(description_i18n) = 'object');
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- 3) Backfill the 14 official groups
-- Official program names (Express Entry, PNP, PR) stay in English.
-- ----------------------------------------------------------------------------
update public.groups set
  name_i18n = '{"fr-CA":"Passionnés de techno","vi":"Người yêu công nghệ","es":"Entusiastas de la tecnología","ar":"عشّاق التقنية","hi":"टेक प्रेमी","pa":"ਟੈਕ ਦੇ ਸ਼ੌਕੀਨ"}'::jsonb,
  description_i18n = '{"fr-CA":"Un groupe pour les personnes passionnées de technologie.","vi":"Nhóm dành cho những người đam mê công nghệ.","es":"Un grupo para personas apasionadas por la tecnología.","ar":"مجموعة للشغوفين بالتقنية.","hi":"तकनीक के शौकीन लोगों के लिए एक समूह।","pa":"ਤਕਨਾਲੋਜੀ ਦੇ ਸ਼ੌਕੀਨ ਲੋਕਾਂ ਲਈ ਇੱਕ ਗਰੁੱਪ।"}'::jsonb
where id = 4 and btrim(group_name, E' \n\r\t') = 'Tech Enthusiasts';

update public.groups set
  name_i18n = '{"fr-CA":"Club de lecture","vi":"Câu lạc bộ sách","es":"Club de lectura","ar":"نادي الكتاب","hi":"बुक क्लब","pa":"ਬੁੱਕ ਕਲੱਬ"}'::jsonb,
  description_i18n = '{"fr-CA":"Discutez de vos livres et de vos auteurs préférés.","vi":"Thảo luận về những cuốn sách và tác giả bạn yêu thích.","es":"Conversa sobre tus libros y autores favoritos.","ar":"ناقش كتبك ومؤلفيك المفضلين.","hi":"अपनी पसंदीदा किताबों और लेखकों पर चर्चा करें।","pa":"ਆਪਣੀਆਂ ਮਨਪਸੰਦ ਕਿਤਾਬਾਂ ਅਤੇ ਲੇਖਕਾਂ ਬਾਰੇ ਚਰਚਾ ਕਰੋ।"}'::jsonb
where id = 5 and btrim(group_name, E' \n\r\t') = 'Book Club';

update public.groups set
  name_i18n = '{"fr-CA":"Aide au logement","vi":"Hỗ trợ nhà ở","es":"Ayuda con la vivienda","ar":"المساعدة في السكن","hi":"आवास सहायता","pa":"ਰਿਹਾਇਸ਼ ਸਹਾਇਤਾ"}'::jsonb,
  description_i18n = '{"fr-CA":"Un groupe pour obtenir des conseils sur les options de logement, ainsi que des trucs et astuces.","vi":"Nhóm dành cho những ai muốn được tư vấn về các lựa chọn nhà ở cùng nhiều mẹo hữu ích.","es":"Un grupo para quienes buscan consejos sobre opciones de vivienda, además de trucos y recomendaciones.","ar":"مجموعة لمن يريد نصائح حول خيارات السكن، مع أفكار وحيل مفيدة.","hi":"उन लोगों के लिए समूह जो आवास के विकल्पों पर सलाह और काम के सुझाव चाहते हैं।","pa":"ਉਹਨਾਂ ਲੋਕਾਂ ਲਈ ਗਰੁੱਪ ਜੋ ਰਿਹਾਇਸ਼ ਦੇ ਵਿਕਲਪਾਂ ਬਾਰੇ ਸਲਾਹ ਅਤੇ ਕੰਮ ਦੇ ਨੁਕਤੇ ਚਾਹੁੰਦੇ ਹਨ।"}'::jsonb
where id = 7 and btrim(group_name, E' \n\r\t') = 'Housing Assistance';

update public.groups set
  name_i18n = '{"fr-CA":"Étudiants internationaux","vi":"Du học sinh","es":"Estudiantes internacionales","ar":"الطلاب الدوليون","hi":"अंतरराष्ट्रीय छात्र","pa":"ਅੰਤਰਰਾਸ਼ਟਰੀ ਵਿਦਿਆਰਥੀ"}'::jsonb,
  description_i18n = '{"fr-CA":"Un espace où les étudiants internationaux au Canada peuvent poser des questions, partager leurs expériences et s''entraider pour les études, le travail et la vie en dehors des cours. Sujets abordés : permis d''études, travail à temps partiel, logement, vie sur le campus et parcours après l''obtention du diplôme.","vi":"Không gian để du học sinh tại Canada đặt câu hỏi, chia sẻ kinh nghiệm và hỗ trợ nhau trong việc học, việc làm và cuộc sống ngoài lớp học. Các chủ đề gồm giấy phép du học, việc làm bán thời gian, nhà ở, đời sống sinh viên và các hướng đi sau khi tốt nghiệp.","es":"Un espacio para que los estudiantes internacionales en Canadá hagan preguntas, compartan experiencias y se apoyen entre sí en los estudios, el trabajo y la vida fuera del aula. Los temas incluyen permisos de estudio, trabajo a tiempo parcial, vivienda, vida en el campus y opciones después de graduarse.","ar":"مساحة للطلاب الدوليين في كندا لطرح الأسئلة وتبادل التجارب ودعم بعضهم بعضًا في الدراسة والعمل والحياة خارج قاعات الدرس. تشمل المواضيع تصاريح الدراسة والعمل بدوام جزئي والسكن والحياة الجامعية والمسارات المتاحة بعد التخرج.","hi":"कनाडा में अंतरराष्ट्रीय छात्रों के लिए एक जगह, जहां वे सवाल पूछ सकते हैं, अनुभव साझा कर सकते हैं और पढ़ाई, काम और कक्षा के बाहर की ज़िंदगी में एक-दूसरे का साथ दे सकते हैं। विषयों में स्टडी परमिट, पार्ट-टाइम काम, आवास, कैंपस जीवन और पढ़ाई पूरी होने के बाद के रास्ते शामिल हैं।","pa":"ਕੈਨੇਡਾ ਵਿੱਚ ਅੰਤਰਰਾਸ਼ਟਰੀ ਵਿਦਿਆਰਥੀਆਂ ਲਈ ਇੱਕ ਥਾਂ, ਜਿੱਥੇ ਉਹ ਸਵਾਲ ਪੁੱਛ ਸਕਦੇ ਹਨ, ਤਜਰਬੇ ਸਾਂਝੇ ਕਰ ਸਕਦੇ ਹਨ ਅਤੇ ਪੜ੍ਹਾਈ, ਕੰਮ ਅਤੇ ਕਲਾਸ ਤੋਂ ਬਾਹਰ ਦੀ ਜ਼ਿੰਦਗੀ ਵਿੱਚ ਇੱਕ-ਦੂਜੇ ਦਾ ਸਾਥ ਦੇ ਸਕਦੇ ਹਨ। ਵਿਸ਼ਿਆਂ ਵਿੱਚ ਸਟੱਡੀ ਪਰਮਿਟ, ਪਾਰਟ-ਟਾਈਮ ਕੰਮ, ਰਿਹਾਇਸ਼, ਕੈਂਪਸ ਦੀ ਜ਼ਿੰਦਗੀ ਅਤੇ ਪੜ੍ਹਾਈ ਪੂਰੀ ਹੋਣ ਤੋਂ ਬਾਅਦ ਦੇ ਰਾਹ ਸ਼ਾਮਲ ਹਨ।"}'::jsonb
where id = 11 and btrim(group_name, E' \n\r\t') = 'International Students';

update public.groups set
  name_i18n = '{"fr-CA":"Demandeurs de résidence permanente (PR)","vi":"Người nộp hồ sơ PR","es":"Solicitantes de residencia permanente (PR)","ar":"المتقدمون للإقامة الدائمة (PR)","hi":"PR आवेदक","pa":"PR ਬਿਨੈਕਾਰ"}'::jsonb,
  description_i18n = '{"fr-CA":"Pour toutes les personnes qui cheminent dans Entrée express (Express Entry), les programmes des candidats des provinces (PNP), les permis de travail et les délais de la résidence permanente (PR).","vi":"Dành cho những ai đang tìm hiểu Express Entry, các chương trình PNP, giấy phép lao động và thời gian xử lý hồ sơ PR.","es":"Para quienes están en el proceso de Express Entry, los PNP, los permisos de trabajo y los plazos de la residencia permanente (PR).","ar":"لكل من يخوض إجراءات Express Entry وبرامج PNP وتصاريح العمل ومواعيد الإقامة الدائمة (PR).","hi":"उन सभी के लिए जो Express Entry, PNP, वर्क परमिट और PR की समय-सीमाओं को समझ रहे हैं।","pa":"ਉਹਨਾਂ ਸਾਰਿਆਂ ਲਈ ਜੋ Express Entry, PNP, ਵਰਕ ਪਰਮਿਟ ਅਤੇ PR ਦੀਆਂ ਸਮਾਂ-ਸੀਮਾਵਾਂ ਨੂੰ ਸਮਝ ਰਹੇ ਹਨ।"}'::jsonb
where id = 12 and btrim(group_name, E' \n\r\t') = 'PR Applicants';

update public.groups set
  name_i18n = '{"fr-CA":"Travailler au Canada","vi":"Làm việc tại Canada","es":"Trabajar en Canadá","ar":"العمل في كندا","hi":"कनाडा में काम करना","pa":"ਕੈਨੇਡਾ ਵਿੱਚ ਕੰਮ ਕਰਨਾ"}'::jsonb,
  description_i18n = '{"fr-CA":"Discussions sur la recherche d''emploi, la culture en milieu de travail, les CV, les entrevues et les droits des travailleurs.","vi":"Thảo luận về tìm việc, văn hóa nơi làm việc, sơ yếu lý lịch, phỏng vấn và quyền của người lao động.","es":"Conversaciones sobre cómo encontrar empleo, la cultura laboral, los currículums, las entrevistas y los derechos laborales.","ar":"نقاشات حول البحث عن وظيفة وثقافة بيئة العمل والسير الذاتية والمقابلات وحقوق العمل.","hi":"नौकरी खोजने, कार्यस्थल की संस्कृति, रेज़्यूमे, इंटरव्यू और रोज़गार अधिकारों पर चर्चा।","pa":"ਨੌਕਰੀ ਲੱਭਣ, ਕੰਮ ਵਾਲੀ ਥਾਂ ਦੇ ਸੱਭਿਆਚਾਰ, ਰੈਜ਼ਿਊਮੇ, ਇੰਟਰਵਿਊ ਅਤੇ ਰੁਜ਼ਗਾਰ ਦੇ ਹੱਕਾਂ ਬਾਰੇ ਚਰਚਾ।"}'::jsonb
where id = 13 and btrim(group_name, E' \n\r\t') = 'Working in Canada';

update public.groups set
  name_i18n = '{"fr-CA":"Pratique et conversation en anglais","vi":"Luyện tập và trò chuyện tiếng Anh","es":"Práctica y conversación en inglés","ar":"ممارسة اللغة الإنجليزية والمحادثة","hi":"अंग्रेज़ी अभ्यास और बातचीत","pa":"ਅੰਗਰੇਜ਼ੀ ਅਭਿਆਸ ਅਤੇ ਗੱਲਬਾਤ"}'::jsonb,
  description_i18n = '{"fr-CA":"Un espace convivial pour pratiquer l''anglais, partager des ressources et trouver des partenaires de conversation, sans pression.","vi":"Không gian thân thiện để luyện tiếng Anh, chia sẻ tài liệu và tìm bạn trò chuyện mà không áp lực.","es":"Un espacio amigable para practicar inglés, compartir recursos y encontrar compañeros de conversación, sin presión.","ar":"مساحة ودّية لممارسة الإنجليزية ومشاركة المصادر والعثور على شركاء للمحادثة دون ضغط.","hi":"बिना किसी दबाव के अंग्रेज़ी का अभ्यास करने, संसाधन साझा करने और बातचीत के साथी खोजने की एक दोस्ताना जगह।","pa":"ਬਿਨਾਂ ਕਿਸੇ ਦਬਾਅ ਦੇ ਅੰਗਰੇਜ਼ੀ ਦਾ ਅਭਿਆਸ ਕਰਨ, ਸਰੋਤ ਸਾਂਝੇ ਕਰਨ ਅਤੇ ਗੱਲਬਾਤ ਲਈ ਸਾਥੀ ਲੱਭਣ ਦੀ ਇੱਕ ਦੋਸਤਾਨਾ ਥਾਂ।"}'::jsonb
where id = 14 and btrim(group_name, E' \n\r\t') = 'English Practice and Conversation';

update public.groups set
  name_i18n = '{"fr-CA":"Banque, crédit et impôts","vi":"Ngân hàng, tín dụng và thuế","es":"Banca, crédito e impuestos","ar":"البنوك والائتمان والضرائب","hi":"बैंकिंग, क्रेडिट और टैक्स","pa":"ਬੈਂਕਿੰਗ, ਕ੍ਰੈਡਿਟ ਅਤੇ ਟੈਕਸ"}'::jsonb,
  description_i18n = '{"fr-CA":"Bâtissez votre crédit, choisissez vos comptes et vos cartes, et préparez-vous pour la saison des impôts grâce à des explications simples.","vi":"Xây dựng điểm tín dụng, chọn tài khoản và thẻ, và chuẩn bị cho mùa khai thuế với những giải thích đơn giản.","es":"Construye tu historial de crédito, elige cuentas y tarjetas, y prepárate para la temporada de impuestos con explicaciones sencillas.","ar":"ابنِ سجلك الائتماني، واختر الحسابات والبطاقات، واستعد لموسم الضرائب بشروحات مبسّطة.","hi":"आसान व्याख्याओं के साथ क्रेडिट बनाएं, खाते और कार्ड चुनें, और टैक्स सीज़न के लिए तैयार हों।","pa":"ਸੌਖੀ ਵਿਆਖਿਆ ਨਾਲ ਕ੍ਰੈਡਿਟ ਬਣਾਓ, ਖਾਤੇ ਅਤੇ ਕਾਰਡ ਚੁਣੋ, ਅਤੇ ਟੈਕਸ ਸੀਜ਼ਨ ਲਈ ਤਿਆਰ ਹੋਵੋ।"}'::jsonb
where id = 15 and btrim(group_name, E' \n\r\t') = 'Banking, Credit, and Taxes';

update public.groups set
  name_i18n = '{"fr-CA":"Parents et familles","vi":"Phụ huynh và gia đình","es":"Padres y familias","ar":"الآباء والأمهات والعائلات","hi":"माता-पिता और परिवार","pa":"ਮਾਪੇ ਅਤੇ ਪਰਿਵਾਰ"}'::jsonb,
  description_i18n = '{"fr-CA":"Services de garde, écoles, ressources pour les familles et soutien au quotidien pour les parents qui s''installent dans un nouvel endroit.","vi":"Chăm sóc trẻ, trường học, nguồn hỗ trợ cho gia đình và sự giúp đỡ hằng ngày dành cho phụ huynh đang ổn định cuộc sống ở nơi mới.","es":"Cuidado infantil, escuelas, recursos para familias y apoyo en el día a día para padres que se establecen en un lugar nuevo.","ar":"رعاية الأطفال والمدارس وموارد الأسرة ودعم يومي للآباء والأمهات المستقرين في مكان جديد.","hi":"नई जगह पर बस रहे माता-पिता के लिए चाइल्डकेयर, स्कूल, पारिवारिक संसाधन और रोज़मर्रा की मदद।","pa":"ਨਵੀਂ ਥਾਂ ''ਤੇ ਵਸ ਰਹੇ ਮਾਪਿਆਂ ਲਈ ਬੱਚਿਆਂ ਦੀ ਦੇਖਭਾਲ, ਸਕੂਲ, ਪਰਿਵਾਰਕ ਸਰੋਤ ਅਤੇ ਰੋਜ਼ਾਨਾ ਦੀ ਮਦਦ।"}'::jsonb
where id = 16 and btrim(group_name, E' \n\r\t') = 'Parents and Families';

update public.groups set
  name_i18n = '{"fr-CA":"Alertes à la fraude et sécurité","vi":"Cảnh báo lừa đảo và an toàn","es":"Alertas de estafas y seguridad","ar":"تنبيهات الاحتيال والسلامة","hi":"धोखाधड़ी अलर्ट और सुरक्षा","pa":"ਧੋਖਾਧੜੀ ਅਲਰਟ ਅਤੇ ਸੁਰੱਖਿਆ"}'::jsonb,
  description_i18n = '{"fr-CA":"Partagez les fraudes courantes, les signaux d''alarme en matière de logement et des conseils pour rester en sécurité en ligne et dans la communauté.","vi":"Chia sẻ các chiêu lừa đảo thường gặp, dấu hiệu đáng ngờ khi thuê nhà và mẹo giữ an toàn trên mạng cũng như trong cộng đồng.","es":"Comparte estafas comunes, señales de alerta al buscar vivienda y consejos para mantenerte seguro en línea y en la comunidad.","ar":"شارك أساليب الاحتيال الشائعة وعلامات التحذير عند البحث عن سكن ونصائح للبقاء آمنًا على الإنترنت وفي المجتمع.","hi":"आम धोखाधड़ी, किराये के घर से जुड़े चेतावनी संकेत, और ऑनलाइन तथा समुदाय में सुरक्षित रहने के सुझाव साझा करें।","pa":"ਆਮ ਧੋਖਾਧੜੀਆਂ, ਕਿਰਾਏ ਦੇ ਘਰ ਨਾਲ ਜੁੜੇ ਚੇਤਾਵਨੀ ਸੰਕੇਤ, ਅਤੇ ਔਨਲਾਈਨ ਤੇ ਕਮਿਊਨਿਟੀ ਵਿੱਚ ਸੁਰੱਖਿਅਤ ਰਹਿਣ ਦੇ ਨੁਕਤੇ ਸਾਂਝੇ ਕਰੋ।"}'::jsonb
where id = 17 and btrim(group_name, E' \n\r\t') = 'Scam Alerts and Safety';

update public.groups set
  name_i18n = '{"fr-CA":"Club gourmand","vi":"Câu lạc bộ ẩm thực","es":"Club de comida","ar":"نادي الطعام","hi":"फ़ूड क्लब","pa":"ਫੂਡ ਕਲੱਬ"}'::jsonb,
  description_i18n = '{"fr-CA":"Échangez vos bonnes adresses de restaurants, vos trouvailles halal ou végétariennes, les endroits de cuisine du monde et les lieux où l''on se sent comme à la maison.","vi":"Trao đổi gợi ý nhà hàng, quán halal hoặc quán chay, các địa điểm ẩm thực văn hóa và những nơi mang lại cảm giác như ở nhà.","es":"Intercambia recomendaciones de restaurantes, opciones halal o vegetarianas, lugares de comida típica y sitios que se sienten como en casa.","ar":"تبادل ترشيحات المطاعم وخيارات الحلال والأطباق النباتية وأماكن الأكلات التراثية والأماكن التي تُشعرك بأنك في بلدك.","hi":"रेस्टोरेंट की सिफ़ारिशें, हलाल और शाकाहारी विकल्प, अपनी संस्कृति के खाने की जगहें और घर जैसा एहसास देने वाली जगहें साझा करें।","pa":"ਰੈਸਟੋਰੈਂਟਾਂ ਦੀਆਂ ਸਿਫ਼ਾਰਸ਼ਾਂ, ਹਲਾਲ ਅਤੇ ਸ਼ਾਕਾਹਾਰੀ ਵਿਕਲਪ, ਆਪਣੇ ਸੱਭਿਆਚਾਰ ਦੇ ਖਾਣੇ ਵਾਲੀਆਂ ਥਾਵਾਂ ਅਤੇ ਘਰ ਵਰਗਾ ਅਹਿਸਾਸ ਦੇਣ ਵਾਲੀਆਂ ਥਾਵਾਂ ਸਾਂਝੀਆਂ ਕਰੋ।"}'::jsonb
where id = 18 and btrim(group_name, E' \n\r\t') = 'Food Club';

update public.groups set
  name_i18n = '{"fr-CA":"Victoires des nouveaux arrivants","vi":"Thành công của người mới đến","es":"Logros de recién llegados","ar":"إنجازات الوافدين الجدد","hi":"नवागंतुकों की जीत","pa":"ਨਵੇਂ ਆਏ ਲੋਕਾਂ ਦੀਆਂ ਜਿੱਤਾਂ"}'::jsonb,
  description_i18n = '{"fr-CA":"Partagez votre victoire de la semaine, petite ou grande, et encouragez les autres avec vos bons mots et vos conseils.","vi":"Chia sẻ thành công trong tuần của bạn, dù lớn hay nhỏ, và cổ vũ mọi người bằng lời động viên và mẹo hay.","es":"Comparte tu logro de la semana, grande o pequeño, y anima a los demás con palabras de aliento y consejos.","ar":"شارك إنجازك هذا الأسبوع، كبيرًا كان أم صغيرًا، وشجّع الآخرين بكلمات الدعم والنصائح.","hi":"इस हफ़्ते की अपनी जीत साझा करें, चाहे बड़ी हो या छोटी, और हौसला बढ़ाने वाली बातों और सुझावों से दूसरों का उत्साह बढ़ाएं।","pa":"ਇਸ ਹਫ਼ਤੇ ਦੀ ਆਪਣੀ ਜਿੱਤ ਸਾਂਝੀ ਕਰੋ, ਭਾਵੇਂ ਵੱਡੀ ਹੋਵੇ ਜਾਂ ਛੋਟੀ, ਅਤੇ ਹੌਸਲਾ ਵਧਾਉਣ ਵਾਲੀਆਂ ਗੱਲਾਂ ਤੇ ਨੁਕਤਿਆਂ ਨਾਲ ਦੂਜਿਆਂ ਦਾ ਉਤਸ਼ਾਹ ਵਧਾਓ।"}'::jsonb
where id = 19 and btrim(group_name, E' \n\r\t') = 'Newcomer Wins';

update public.groups set
  name_i18n = '{"fr-CA":"Ciné-club","vi":"Câu lạc bộ phim","es":"Club de cine","ar":"نادي الأفلام","hi":"मूवी क्लब","pa":"ਮੂਵੀ ਕਲੱਬ"}'::jsonb,
  description_i18n = '{"fr-CA":"Votez pour un film, regardez-le ensemble ou publiez de courtes critiques et des fils de discussion.","vi":"Bình chọn phim, xem cùng nhau hoặc để lại nhận xét ngắn và chủ đề thảo luận.","es":"Vota por una película, véanla juntos o deja reseñas breves e hilos de conversación.","ar":"صوّت لاختيار فيلم، وشاهدوه معًا، أو اكتب مراجعات سريعة وافتح نقاشات.","hi":"फ़िल्म के लिए वोट करें, साथ में देखें, या छोटी समीक्षाएं और चर्चा के थ्रेड लिखें।","pa":"ਫ਼ਿਲਮ ਲਈ ਵੋਟ ਪਾਓ, ਇਕੱਠੇ ਦੇਖੋ, ਜਾਂ ਛੋਟੇ ਰੀਵਿਊ ਅਤੇ ਚਰਚਾ ਦੇ ਥ੍ਰੈੱਡ ਲਿਖੋ।"}'::jsonb
where id = 20 and btrim(group_name, E' \n\r\t') = 'Movie Club';

update public.groups set
  name_i18n = '{"fr-CA":"Club de musique","vi":"Câu lạc bộ âm nhạc","es":"Club de música","ar":"نادي الموسيقى","hi":"म्यूज़िक क्लब","pa":"ਮਿਊਜ਼ਿਕ ਕਲੱਬ"}'::jsonb,
  description_i18n = '{"fr-CA":"Partagez vos listes de lecture, découvrez de nouveaux artistes et parlez de musique!","vi":"Chia sẻ danh sách phát, khám phá nghệ sĩ mới và trò chuyện về âm nhạc!","es":"¡Comparte listas de reproducción, descubre nuevos artistas y habla de música!","ar":"شارك قوائم التشغيل، واكتشف فنانين جددًا، وتحدّث عن الموسيقى!","hi":"प्लेलिस्ट साझा करें, नए कलाकार खोजें और संगीत पर बातचीत करें!","pa":"ਪਲੇਲਿਸਟਾਂ ਸਾਂਝੀਆਂ ਕਰੋ, ਨਵੇਂ ਕਲਾਕਾਰ ਲੱਭੋ ਅਤੇ ਸੰਗੀਤ ਬਾਰੇ ਗੱਲਬਾਤ ਕਰੋ!"}'::jsonb
where id = 21 and btrim(group_name, E' \n\r\t') = 'Music Club';

commit;

-- Make PostgREST see the new columns.
notify pgrst, 'reload schema';
