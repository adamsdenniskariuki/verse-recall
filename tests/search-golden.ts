/**
 * Half-remembered, paraphrased, misspelt and misheard queries with the verse a person most likely means.
 * Each case lists every acceptable answer as BOOK CHAPTER:VERSE. Used to measure top-3 accuracy.
 */
export const GOLDEN: readonly [query: string, expected: readonly string[]][] = [
  ['lamp for my feet', ['PSA 119:105']],
  ['for god so loved the world he gave his only son', ['JOH 3:16']],
  ["the lord is my shepherd I won't want", ['PSA 23:1']],
  ['I can do all things through christ who strengthens me', ['PHI 4:13']],
  ['all things work together for good for those who love god', ['ROM 8:28']],
  ['trust in the lord with all your heart and lean not on your own understanding', ['PRO 3:5']],
  ['love is patient love is kind', ['1CO 13:4']],
  ['be still and know that I am god', ['PSA 46:10']],
  ['the wages of sin is death', ['ROM 6:23']],
  ['in the beginning was the word', ['JOH 1:1']],
  ['in the beginning god created the heavens and the earth', ['GEN 1:1']],
  ['I am the way the truth and the life', ['JOH 14:6']],
  ['I know the plans I have for you, plans for peace, a hope and a future', ['JER 29:11']],
  ['do not be anxious about anything, pray with thanksgiving', ['PHI 4:6']],
  ['those who wait on the lord renew their strength, mount up with wings like eagles', ['ISA 40:31']],
  ['come to me all who are weary and burdened and I will give you rest', ['MAT 11:28']],
  ['faith is the substance of things hoped for', ['HEB 11:1']],
  ['be strong and courageous, do not be afraid, the lord is with you wherever you go', ['JOS 1:9']],
  ['the fruit of the spirit is love joy peace patience', ['GAL 5:22']],
  ['put on the whole armour of god', ['EPH 6:11']],
  ['cast all your worries on him because he cares for you', ['1PE 5:7']],
  ['the joy of the lord is your strength', ['NEH 8:10']],
  ['create in me a clean heart o god', ['PSA 51:10']],
  ['jesus wept', ['JOH 11:35']],
  ['blessed are the poor in spirit for theirs is the kingdom of heaven', ['MAT 5:3']],
  ['blessed are the peacemakers', ['MAT 5:9']],
  ['seek first the kingdom of god and his righteousness', ['MAT 6:33']],
  ['all have sinned and fall short of the glory of god', ['ROM 3:23']],
  ['if we confess our sins he is faithful and just to forgive us', ['1JO 1:9']],
  ['I have hidden your word in my heart so that I might not sin', ['PSA 119:11']],
  ['the heavens declare the glory of god', ['PSA 19:1']],
  ['do not fear for I am with you, do not be dismayed, I am your god', ['ISA 41:10']],
  ['a gentle answer turns away wrath', ['PRO 15:1']],
  ['iron sharpens iron', ['PRO 27:17']],
  ['for everything there is a season, a time for every purpose under heaven', ['ECC 3:1']],
  ['the truth will make you free', ['JOH 8:32']],
  ['god is our refuge and strength, a very present help in trouble', ['PSA 46:1']],
  ['my grace is sufficient for you, power made perfect in weakness', ['2CO 12:9']],
  ['nothing can separate us from the love of god in christ jesus', ['ROM 8:38', 'ROM 8:39']],
  ['his mercies are new every morning, great is your faithfulness', ['LAM 3:22', 'LAM 3:23']],
  ['lamp unto my feat and a lite unto my path', ['PSA 119:105']],
  ['the lord is my shepard', ['PSA 23:1']],
  ['thy word is a lamp unto my feet', ['PSA 119:105']],
  ['he restoreth my soul', ['PSA 23:3']],
];
/** The golden set must keep at least this share of expected verses in the top three. */
export const GOLDEN_TOP3_THRESHOLD = 0.85;

/**
 * Paraphrases that share few words with any translation, so they need meaning search.
 * Used together with GOLDEN to measure meaning search and the merged ranking.
 */
export const GOLDEN_MEANING: readonly [query: string, expected: readonly string[]][] = [
  ["god's word guides where I walk", ['PSA 119:105']],
  ["don't worry about tomorrow, it has enough troubles of its own", ['MAT 6:34']],
  ['god will never abandon you', ['HEB 13:5', 'DEU 31:6', 'DEU 31:8', 'JOS 1:5']],
  ['treat other people the way you want them to treat you', ['MAT 7:12', 'LUK 6:31']],
  ['saved by grace as a gift, not because of good deeds', ['EPH 2:8', 'EPH 2:9']],
  ['god is close to people whose hearts are broken', ['PSA 34:18', 'PSA 147:3']],
  ['the lord will fight for you, you just need to stay calm', ['EXO 14:14']],
  ['your body is a temple of the holy spirit', ['1CO 6:19']],
  ['arrogance comes before a downfall', ['PRO 16:18']],
  ['whatever job you do, work hard as if for the lord', ['COL 3:23']],
  ['greed for money causes all kinds of evil', ['1TI 6:10']],
  ['nothing is too hard for god', ['LUK 1:37', 'JER 32:17', 'JER 32:27', 'MAT 19:26', 'GEN 18:14']],
  ['love god with everything you have', ['MAT 22:37', 'MAR 12:30', 'DEU 6:5', 'LUK 10:27']],
  ['he heals the brokenhearted and bandages their wounds', ['PSA 147:3']],
  ['god disciplines the people he loves', ['HEB 12:6', 'PRO 3:12', 'REV 3:19']],
  ['ask and you will receive, knock and the door opens', ['MAT 7:7', 'LUK 11:9']],
];
/** Meaning search, merged with the other strategies, must keep at least this share in the top three. */
export const MEANING_TOP3_THRESHOLD = 0.85;
