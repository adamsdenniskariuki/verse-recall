// Topic search ("verses about anxiety"): recognises the question and ranks the topic's references.
import { editDistance, terms } from './normalize';
import { TOPICS, type Topic } from './topic-data';
import type { VerseTable } from './index-format';

export interface TopicVerse { book: string; chapter: number; verse: number; end?: number }

export function topicVerses(topic: Topic): TopicVerse[] {
  return topic.refs.split(';').map(ref => {
    const match = /^([1-3]?[A-Z]{2,3}) (\d+):(\d+)(?:-(\d+))?$/u.exec(ref.trim());
    if (!match) throw new Error(`Invalid topic reference ${ref}`);
    const [, book, chapter, verse, end] = match;
    return { book, chapter: Number(chapter), verse: Number(verse), ...(end ? { end: Number(end) } : {}) };
  });
}

/** Asking phrases that mean "show me a topic", e.g. "what does the Bible say about worry". */
const ASKING = /^(?:(?:show|give|find|list)(?: me)?\s+)?(?:(?:some|good|bible|scripture|scriptures|verses?|passages?|what|does|do|the|bible\s+say|says?|is|are|there|any)\s+)*(?:(?:about|on|for|regarding|concerning|when\s+(?:i\s+am|i'm|im|i\s+feel|feeling|you\s+are|you\s+feel))\s+)+/u;
const TRAILING = /\s+(?:verses?|scriptures?|passages?|in\s+the\s+bible|bible\s+verses?)$/u;

const stemmed = (phrase: string) => terms(phrase).join(' ');
const WORDS: [string, Topic][] = TOPICS.flatMap(topic => [topic.title, ...topic.words].map(word => [stemmed(word), topic] as [string, Topic]))
  .filter(([word]) => word);

/**
 * The topic a query asks about, or null. Plain words only count when the whole query is a topic word
 * ("anxiety", "worry verses"), so remembered phrases such as "the Lord is my shepherd" are never taken as topics.
 */
export function matchTopic(query: string): Topic | null {
  const folded = query.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^a-z'’\s]/gu, ' ').replace(/\s+/gu, ' ').trim();
  const asked = ASKING.test(folded);
  const rest = folded.replace(ASKING, '').replace(TRAILING, '').replace(/^(?:being|feeling|my|a|an|the)\s+/u, '').trim();
  const wanted = stemmed(rest);
  if (!wanted || wanted.split(' ').length > 3) return null;
  if (!asked && rest.split(' ').length > 2) return null;
  for (const [word, topic] of WORDS) if (word === wanted) return topic;
  // Typos and mishearing: allow one edit in longer single words ("anxeity", "forgivness").
  if (wanted.length >= 5 && !wanted.includes(' ')) {
    for (const [word, topic] of WORDS) if (!word.includes(' ') && editDistance(wanted, word, 2) <= (word.length >= 7 ? 2 : 1)) return topic;
  }
  return null;
}

/** Topic results ranked in list order, ready to merge with the other strategies. */
export function topicHits(topic: Topic, table: VerseTable): { ordinal: number; score: number; end?: number }[] {
  return topicVerses(topic).flatMap((v, i) => {
    const ordinal = table.ordinal(v.book, v.chapter, v.verse);
    return ordinal === undefined ? [] : [{ ordinal, score: 0.92 - 0.015 * i, ...(v.end ? { end: v.end } : {}) }];
  });
}

