import { BIBLE_SNAPSHOT } from './bible-version';
import { loadBibleManifest, resolveBibleSelection, type BibleBook, type BibleManifest, type BibleSelection, type BibleTranslation } from './bible-catalog';
import { editions, type Filter, type Passage } from './content';
import { escapeHtml as e, options } from './html';

export class BiblePicker {
  readonly dialog = document.createElement('dialog');
  private index?: BibleManifest;
  private translation: BibleTranslation = 'webbe';
  private filter: Filter = 'both';
  private query = '';
  private book = '';
  private chapter = 1;
  private start = 1;
  private end = 1;
  private generation = 0;
  private preview?: { selection: BibleSelection; passage: Passage };

  constructor(private add: (selection: BibleSelection, passage: Passage) => string) {
    this.dialog.className = 'preferences-dialog';
    this.dialog.id = 'bible-picker';
    this.dialog.setAttribute('aria-labelledby', 'bible-picker-title');
    document.body.append(this.dialog);
    this.dialog.addEventListener('close', () => {
      this.generation++;
      document.querySelector<HTMLElement>('[data-action="browse-bibles"]')?.focus();
    });
    this.dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const nodes = [...this.dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input, select:not([disabled]), a[href]')]
        .filter(node => node.checkVisibility());
      if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus(); }
    });
    this.dialog.addEventListener('click', event => {
      const action = (event.target as Element).closest<HTMLElement>('button')?.dataset.bibleAction;
      if (action === 'close') this.dialog.close();
      if (action === 'retry') void this.load();
      if (action === 'add' && this.preview) {
        try { this.status(this.add(this.preview.selection, this.preview.passage)); }
        catch (error) { this.status(error instanceof Error ? error.message : 'Could not add this passage.', true); }
      }
    });
    this.dialog.addEventListener('input', event => {
      const node = event.target;
      if (node instanceof HTMLInputElement && node.id === 'bible-book-search') {
        this.query = node.value;
        this.chooseBook();
        this.render();
        const input = this.dialog.querySelector<HTMLInputElement>('#bible-book-search')!;
        input.focus(); input.setSelectionRange(input.value.length, input.value.length);
        void this.showPreview();
      }
    });
    this.dialog.addEventListener('change', event => {
      const node = event.target;
      if (!(node instanceof HTMLSelectElement)) return;
      if (node.id === 'bible-translation') { this.translation = node.value as BibleTranslation; this.chooseBook(); }
      else if (node.id === 'bible-testament') { this.filter = node.value as Filter; this.chooseBook(); }
      else if (node.id === 'bible-book') { this.book = node.value; this.chapter = 1; this.resetVerses(); }
      else if (node.id === 'bible-chapter') { this.chapter = Number(node.value); this.resetVerses(); }
      else if (node.id === 'bible-start') { this.start = Number(node.value); this.end = this.start; }
      else if (node.id === 'bible-end') this.end = Number(node.value);
      this.render();
      this.dialog.querySelector<HTMLElement>(`#${node.id}`)?.focus();
      void this.showPreview();
    });
  }
  open(translation: string, filter: Filter): void {
    if (this.dialog.open) return;
    this.translation = translation === 'bsb' ? 'bsb' : 'webbe';
    this.filter = filter;
    this.query = '';
    this.dialog.showModal();
    void this.load();
  }
  private async load(): Promise<void> {
    const generation = ++this.generation;
    this.dialog.innerHTML = `<div class="dialog-heading"><h2 id="bible-picker-title">Choose from the Bible</h2><button data-bible-action="close">Close ×</button></div><div class="dialog-content"><p role="status">Loading official Bible index…</p></div>`;
    this.dialog.querySelector<HTMLButtonElement>('button')!.focus();
    try {
      const index = await loadBibleManifest();
      if (generation !== this.generation) return;
      this.index = index;
      this.chooseBook();
      this.render();
      this.dialog.querySelector<HTMLButtonElement>('[data-bible-action="close"]')!.focus();
      await this.showPreview();
    } catch (error) {
      if (generation !== this.generation) return;
      this.dialog.querySelector('.dialog-content')!.innerHTML = `<p role="alert">${e(error instanceof Error ? error.message : 'Bible index unavailable.')}</p><button data-bible-action="retry">Retry loading</button>`;
    }
  }
  private books(): BibleBook[] {
    return (this.index?.translations[this.translation].books ?? []).filter(book =>
      (this.filter === 'both' || book.testament === this.filter) && book.name.toLowerCase().includes(this.query.trim().toLowerCase()));
  }
  private currentBook(): BibleBook | undefined { return this.books().find(b => b.id === this.book); }
  private resetVerses(): void {
    this.start = this.currentBook()?.chapters.find(c => c.number === this.chapter)?.verses[0] ?? 1;
    this.end = this.start;
  }
  private chooseBook(): void {
    this.book = this.books()[0]?.id ?? '';
    this.chapter = 1;
    this.resetVerses();
  }
  private status(message: string, error = false): void {
    const node = this.dialog.querySelector<HTMLElement>('#bible-status')!;
    node.setAttribute('role', error ? 'alert' : 'status');
    node.textContent = message;
    node.className = error ? 'dialog-error' : 'dialog-message';
  }
  private render(): void {
    this.preview = undefined;
    const book = this.currentBook();
    const chapters = book?.chapters ?? [];
    const numbers = chapters.find(c => c.number === this.chapter)?.verses ?? [];
    this.dialog.innerHTML = `<div class="dialog-heading"><h2 id="bible-picker-title">Choose from the Bible</h2><button data-bible-action="close">Close ×</button></div>
      <div class="dialog-content"><p class="small">Official WEB British and BSB text. Browse 66 shared books (39 Old Testament, 27 New Testament). No notes, audio or deuterocanonical books. Verse availability follows each edition.</p>
      <div class="settings-grid">
        <label>Translation<select id="bible-translation">${options(this.translation, [['webbe', 'WEB British'], ['bsb', 'BSB']])}</select></label>
        <label>Testament<select id="bible-testament">${options(this.filter, [['both', 'Both'], ['OT', 'Old Testament'], ['NT', 'New Testament']])}</select></label>
      </div><label>Search book names<input id="bible-book-search" type="search" value="${e(this.query)}" placeholder="For example, Isaiah or John"></label>
      <div class="settings-grid">
        <label>Book<select id="bible-book" ${!book ? 'disabled' : ''}>${options(this.book, this.books().map(b => [b.id, b.name]))}</select></label>
        <label>Chapter<select id="bible-chapter" ${!book ? 'disabled' : ''}>${options(String(this.chapter), chapters.map(c => [String(c.number), String(c.number)]))}</select></label>
        <label>Verse<select id="bible-start" ${!book ? 'disabled' : ''}>${options(String(this.start), numbers.map(v => [String(v), String(v)]))}</select></label>
        <label>Through verse (optional)<select id="bible-end" ${!book ? 'disabled' : ''}>${options(String(this.end), numbers.filter(v => v >= this.start).map(v => [String(v), String(v)]))}</select></label>
      </div><p class="small">Single verse by default. Ranges stay within one chapter and must fit 120 words / 2,000 characters; nothing is truncated. Blank or omitted references are not replaced from another edition.</p>
      <div id="bible-status" role="status" aria-live="polite"></div>
      <section id="bible-preview" aria-label="Selected verse preview"></section>
      <div class="actions"><button class="primary" data-bible-action="add" disabled>Add to my library</button></div>
      <p class="small">Your current exercise is kept. Added selections are stored as official references, not editable personal text. On reload/import the app validates them against its shipped source edition.</p></div>`;
  }
  private async showPreview(): Promise<void> {
    const generation = ++this.generation;
    this.preview = undefined;
    const button = this.dialog.querySelector<HTMLButtonElement>('[data-bible-action="add"]');
    if (!button) return;
    button.disabled = true;
    if (!this.currentBook()) { this.status('No books match this search and Testament. Change the search or filter.'); return; }
    this.status('Loading and validating official verse text…');
    const selection: BibleSelection = { snapshot: BIBLE_SNAPSHOT, translation: this.translation, book: this.book, chapter: this.chapter, start: this.start, end: this.end };
    try {
      const passage = await resolveBibleSelection(selection);
      if (generation !== this.generation) return;
      this.preview = { selection, passage };
      this.dialog.querySelector('#bible-preview')!.innerHTML = `<h3>${e(passage.reference)}</h3><blockquote class="verse">${e(passage.text)}</blockquote>
        <p class="small">${e(editions[this.translation].name)} · ${e(passage.edition)}</p>
        <p class="small">${e(editions[this.translation].rights)}</p>
        <p><a href="${passage.source}" target="_blank" rel="noreferrer">Official text source ↗</a> · <a href="${editions[this.translation].rightsUrl}" target="_blank" rel="noreferrer">Rights ↗</a></p>`;
      button.disabled = false;
      this.status('Review the exact wording, then add this passage.');
    } catch (error) {
      if (generation !== this.generation) return;
      this.status(error instanceof Error ? error.message : 'Unable to load this verse. Nothing was added.', true);
      this.dialog.querySelector('#bible-preview')!.innerHTML = '<button data-bible-action="retry">Retry loading</button>';
    }
  }
}
