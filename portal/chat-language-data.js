// Shared local moderation configuration. No message text leaves the process.
export const PROFANITY_BLOCKED_MESSAGE =
  "Сообщение содержит недопустимые выражения. Пожалуйста, измените текст и отправьте его снова";
export const MODERATION_UNAVAILABLE_MESSAGE =
  "Не удалось проверить сообщение. Попробуйте отправить его ещё раз.";
export const CHAT_LANGUAGE_ERROR = PROFANITY_BLOCKED_MESSAGE;
export const MODERATION_SETTINGS = Object.freeze({
  maxInputLength: 10000,
  maxJoinedCharacters: 64,
  maxJoinedFragments: 20,
  maxWhitespaceFragmentLength: 4,
  maxMaskLength: 3,
});

// Sources are anchored by the matcher, never searched as arbitrary substrings.
// A family change needs both a blocked example and a neutral near-match test.
const prefix =
  "(?:(?:на|по|ни|не|за|до|вы|от[ъь]?|под[ъь]?|об[ъь]?|про|пере|раз[ъь]?|рас[ъь]?|с[ъь]?|в[ъь]|а|о|у)){0,2}";
const requiredPrefix = prefix.replace("{0,2}", "{1,2}");
export const RUSSIAN_FAMILIES = Object.freeze([
  { id: "khuy", source: prefix + "ху(?:й[а-я]*|[яюеи][а-я]*|ли)" },
  {
    id: "ebat",
    source: prefix + "еб(?:а|у|л|н|ы|и|е[нтшбпм]|о[нк]?|к|щ)[а-я]*",
  },
  { id: "prefixed-eb", source: requiredPrefix + "еб" },
  { id: "compound-eb", source: "(?:долб[оа]|далба|тупо|мозго|мудо)еб[а-я]*" },
  { id: "pizda", source: prefix + "пизд[а-я]*" },
  { id: "pizda-short", source: "(?:пздц|пздец)" },
  { id: "blyad", source: "(?:бля|бл[яэ][тд][а-я]*|блеа(?:ть)?)" },
  {
    id: "suka",
    source:
      "су(?:к(?:а|и|е|у|ой|ою|ами|ам|ах|ин(?:а|ы|у|ым|ого|ых|ский)?)|ч(?:к[а-я]*|ар[а-я]*|и[а-я]*|он[а-я]*|ен(?:ок|ыш)[а-я]*))",
  },
  {
    id: "mudak",
    source:
      "муд(?:ак[а-я]*|ач[а-я]*|ил[а-я]*|озвон[а-я]*|ень|ня|ню|нем|ни|ней)",
  },
  {
    id: "pidor",
    source:
      "(?:пидор|пидар|пидарас|пидорас|пидерас|пидр|педераст|педорас|педараст|педрас|педрила)[а-я]*",
  },
  { id: "pedik", source: "педик(?:и|а|у|ом|ов|ам|ах|ами)?" },
  {
    id: "shluha",
    source: "(?:шлюх|шлюшк|шлюшар|шалав|потаскух|прошмандов)[а-я]*",
  },
  {
    id: "ublyudok",
    source: "(?:ублюд(?:ок|к|оч)|выбляд(?:ок|к)|вырод(?:ок|к))[а-я]*",
  },
  { id: "gandon", source: "г[ао]нд(?:он|ош)[а-я]*" },
  { id: "zalupa", source: "залуп[а-я]*" },
  { id: "droch", source: prefix + "дроч[а-я]*" },
  { id: "govno", source: "(?:говн|гавн)[а-я]*" },
  { id: "zhopa", source: "жоп[а-я]*" },
  {
    id: "srat",
    source:
      "(?:за|на|по|про|вы|обо|об|пере|до)?сра(?:ть(?:ся)?|л[а-я]*|н[а-я]*|ч[а-я]*|к[а-я]*)",
  },
  {
    id: "ssat",
    source:
      "(?:обо|за|на|по|про|вы|пере|до)?(?:сса(?:ть|л[а-я]*|н[а-я]*|т[а-я]*|в[а-я]*)|ссык[а-я]*)",
  },
  { id: "chmo", source: "чмо(?:ш(?:ник|ниц|н|к)[а-я]*)?" },
  { id: "chmyr", source: "чмыр(?:ь|я|ю|ем|и|ей|ями|ям|ях|ить|ит|ят|ил)[а-я]*" },
  { id: "chmorit", source: "чмор(?:ить|ит|ят|ил|ен|н)[а-я]*" },
  {
    id: "debil",
    source:
      "дебил(?:ы|а|у|ом|ов|ам|ах|ами|к(?:а|и|е|у|ой|ою|ами|ам|ах)|изм|оид[а-я]*|ьн[а-я]*)?",
  },
  {
    id: "idiot",
    source:
      "идиот(?:ы|а|у|ом|ов|ам|ами|ах|к(?:а|и|е|у|ой|ою|ами|ам|ах)|ск[а-я]*|изм)?",
  },
  { id: "cretin", source: "кретин[а-я]*" },
  { id: "pridurok", source: "придур(?:ок|к|оч)[а-я]*" },
  {
    id: "insults",
    source:
      "(?:мраз[а-я]*|сволоч[а-я]*|падл(?:а|о|ы|е|у|ой|ою|ами|ам|ах|юк[а-я]*)|гнид(?:а|ы|е|у|ой|ою|ами|ам|ах)|быдл[а-я]*|лошар[а-я]*)",
  },
  {
    id: "urod",
    source:
      "урод(?:а|у|ом|ы|ов|ам|ами|ах|ин[а-я]*|ск[а-я]*|лив[а-я]*|ств[а-я]*)?",
  },
  {
    id: "kher",
    source:
      "(?:на|по|о|а|ни|не|до)?хер(?:а|у|ом|е|ы|ов[а-я]*|еть|ел[а-я]*|е[вн][а-я]*|н[а-я]*)?",
  },
  { id: "manda", source: "манд(?:а|ы|е|у|ой|ою|ами|ам|ах|овош[а-я]*)" },
  { id: "elda", source: "елд(?:а|ы|е|у|ой|ою|ами|ам|ах|ак[а-я]*)" },
]);

export const ENGLISH_FAMILIES = Object.freeze([
  {
    id: "fuck",
    source:
      "(?:(?:mother)?fuck(?:s|ed|ing|in|ers?|off|up|heads?|faces?|wits?|tards?|wads?|you)?|mofo)",
  },
  {
    id: "shit",
    source:
      "(?:shit(?:s|ty|ting|heads?|faces?|bags?|stains?|holes?|shows?)?|(?:bul{1,2}|horse|bat)shit(?:s|ting)?)",
  },
  { id: "bitch", source: "bitch(?:es|y|ing)?" },
  { id: "cunt", source: "cunts?" },
  {
    id: "asshole",
    source:
      "(?:as{1,2}holes?|arseholes?|dumbas{1,2}(?:es)?|jackas{1,2}(?:es)?|as{1,2}wipes?)",
  },
  { id: "dickhead", source: "dick(?:heads?|faces?)" },
  { id: "cocksucker", source: "cocksuck(?:ers?|ing)" },
  {
    id: "other-insults",
    source:
      "(?:bastards?|douchebags?|douches?|wankers?|twats?|bollocks|whores?|sluts?|slutty|piss(?:ed|ing)?|faggots?|retard(?:s|ed)?|stfu|wtf)",
  },
]);

export const RUSSIAN_MASK_FAMILIES = Object.freeze([
  prefix + "х[у*][йяюеи][а-я*]*",
  "(?:бл[*]ть|бл[*]д[а-я*]*|п[*]зд[а-я*]*|пиз[*]ец|пизд[*]ц|пздц|пздец|су[*]а|с[*]ка)",
  prefix + "еб[*]ть",
  "ч(?:м[о*]|[*]о)(?:ш(?:ник|ниц|н|к)[а-я*]*)?",
  prefix + "(?:[е*]б(?:и[щ*]|[и*]щ)|е[б*]ищ)[а-я*]*",
]);

// Exact word exceptions do not exempt another word in the same message.
export const EXACT_EXCEPTIONS = Object.freeze([
  "херсон",
  "херсонская",
  "херсонский",
  "херсонской",
  "херсонского",
  "херсонские",
  "херес",
  "хересный",
  "хересного",
  "хересная",
  "хересным",
  "мандат",
  "мандата",
  "мандатный",
  "мандарин",
  "мандарина",
  "мандариновый",
  "чмок",
  "чмокнуть",
  "чмокает",
  "чмокнули",
  "педикюр",
  "педикюрный",
  "педикюра",
  "педикюру",
  "педикюром",
  "педикюре",
  "педикюры",
  "педикюров",
  "педикюрная",
  "педикюрное",
  "педикюрные",
  "педикюрным",
  "педикюрного",
  "сукачев",
  "сукачева",
  "сукачевым",
  "уродился",
  "уродилась",
  "уродилось",
  "huygens",
  "huiyang",
  "scunthorpe",
  "dickinson",
  "shitov",
  "shitake",
]);

// These literal forms seed bounded masking and pure-Latin transliteration
// comparisons. Morphology remains in the family rules above. A transliteration
// may omit soft/hard signs; it never enables arbitrary Russian family tails.
export const MASK_WORDS = Object.freeze(
  `
хуй хуя хую хуем хуи хуевый хуево хуйня хуйню хуевина хуятина хуита хуило хуйло хуесос хуесоска хуесосить хуеплет хуеглот хуярить хуячить хуякнуть хули нахуй нахуя похуй похуист похуизм нехуй нихуя дохуя охуеть охуел охуевать охуевший охуенный охуенно охуительный ахуеть ахуенный
ебать ебаться ебал ебала ебали ебет ебут ебало ебальник ебля ебнуть ебнутый ебаный ебанный ебанутый ебанат ебанина ебучий ебливый еблан ебло ебарь заебать заебал заебали заебись заебатый заебывать заебанный заебашить заебенить наебать наебалово наеб наебщик наебывать выебать выебаться выебываться выебон отъебать отъебаться отъебись доебаться доебывать подъебать подъеб подъебка подъебывать разъебать разъеб разъебанный проебать проеб проебывать съебать съебаться съебись съебывать въебать въебывать уебать уебок уебище уебищный уебища уебищу уебищем уебищами уебки уебков
ебище ебища ебищу ебищем ебищный ебем съебем херня херню херни херней сученок
долбоеб долбоебина долбоебизм долбаеб далбаеб тупоеб тупоебище мозгоеб мозгоебать мудоеб
пизда пиздец пиздецкий пиздеть пиздеж пиздить пиздануть пизданутый пиздатый пиздато пиздюк пиздюли пиздюлина пиздобол пиздабол пиздобольство пиздолиз пиздовать пизденыш спиздить спиздеть напиздеть отпиздить запиздить распиздяй распиздяйство пздц пздец
бля блять блядь бляди блядей блядский блядство блядина блядюга блядун блядовать блядюшник блеать блеа блэт
сука сучка сучара сучий сучонок сученыш мудак мудила мудило мудозвон мудень мудачина мудачье пидор пидорас пидарас пидар пидр пидорасина пидорюга пидарюга педераст педорас педик педрила шлюха шлюшка шлюшара шалава потаскуха прошмандовка ублюдок ублюдочный выблядок выродок гандон гондон гандоша залупа залупаться залупистый залупоголовый дрочить дрочка дрочила дрочун дрочер надрочить задрочить говно говнюк говнючка говняный говнище говноед говнодел говношлеп жопа жопный жополиз жопорукий срать срака срань сраный срач насрать обосрать обосраться засрать просрать ссать ссаный ссыкло обоссать обоссаться чмо чмошник чмошный чмошница чмырь чмырить чморить дебил дебилка дебильный дебилоид идиот идиотка идиотский кретин придурок мразь мразота сволочь падла падлюка гнида урод уродина быдло лошара хер нахер похер херовый херово охереть манда мандовошка елда
fuck fucks fucked fucking fucker fuckers fuckoff fuckup fuckhead fuckface fuckwit fucktard fuckwad motherfucker motherfuckers motherfucking motherfuckin mofo shit shits shitty shitting shithead shitface shitbag shitstain shithole shitshow bullshit horseshit batshit bitch bitches bitchy bitching cunt cunts asshole assholes arsehole dumbass jackass asswipe dickhead dickface cocksucker cocksucking bastard bastards douchebag douche wanker twat bollocks whore whores slut sluts slutty piss pissed faggot retard stfu wtf
`
    .trim()
    .split(/\s+/u),
);

export const VISUAL_TO_RUSSIAN = Object.freeze({
  a: "а",
  b: "в",
  c: "с",
  d: "д",
  e: "е",
  f: "ф",
  h: "н",
  i: "и",
  j: "й",
  k: "к",
  l: "л",
  m: "м",
  n: "н",
  o: "о",
  p: "р",
  r: "р",
  s: "с",
  t: "т",
  u: "и",
  v: "в",
  x: "х",
  y: "у",
  z: "з",
  0: "о",
  1: "и",
  3: "з",
  4: "ч",
  5: "с",
  6: "б",
  7: "т",
  8: "в",
  9: "я",
  "@": "а",
  $: "с",
  і: "и",
  ї: "и",
});
export const PHONETIC_TO_RUSSIAN = Object.freeze({
  ...VISUAL_TO_RUSSIAN,
  b: "б",
  c: "ц",
  g: "г",
  h: "х",
  p: "п",
  u: "у",
  w: "в",
  y: "й",
  q: "к",
});
// Used only against finite known word forms, not broad Russian family tails.
export const MIXED_ROMAN_TO_RUSSIAN = Object.freeze({
  ...PHONETIC_TO_RUSSIAN,
  c: "с",
  y: "у",
});
export const VISUAL_TO_ENGLISH = Object.freeze({
  а: "a",
  в: "b",
  с: "c",
  е: "e",
  н: "h",
  к: "k",
  м: "m",
  о: "o",
  р: "p",
  т: "t",
  у: "y",
  х: "x",
  і: "i",
  и: "i",
  0: "o",
  1: "i",
  3: "e",
  4: "a",
  5: "s",
  6: "b",
  8: "b",
  "@": "a",
  $: "s",
});
export const KEYBOARD_TO_RUSSIAN = Object.freeze(
  Object.fromEntries(
    [..."qwertyuiop[]asdfghjkl;'zxcvbnm,./`"].map((key, index) => [
      key,
      [..."йцукенгшщзхъфывапролджэячсмитьбю.ё"][index],
    ]),
  ),
);
export const KEYBOARD_HINTS = Object.freeze([
  /[[\],;']/u,
  /^(?:gbpl|xvj|ve(l|s)|ue(d|j)|;jg)/u,
]);
