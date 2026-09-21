import { escapeHtml as e, options } from './html';
import { makePersonal, MAX_JSON_BYTES } from './personal';
import { confirmImport, defaultMergeOptions, exportBackup, parseImport, planImport, verseTemplate, type ImportPayload, type ImportPlan } from './transfer';
import type { Preferences, SavedState } from './store';

interface Host {
  state(): SavedState;
  changePreferences(patch: Partial<Preferences>): void;
  applyImport(state: SavedState): void;
  storageSnapshot(): string | null;
  saveProblem(): string | null;
  protectedSave(): boolean;
}
export class PreferencesDialog {
  readonly dialog = document.createElement('dialog');
  private pending: ImportPayload | null = null;
  private plan: ImportPlan | null = null;
  private storageBefore: string | null = null;
  private busy = false;
  private generation = 0;

  constructor(private host: Host) {
    this.dialog.id = 'preferences-dialog';
    this.dialog.className = 'preferences-dialog';
    this.dialog.setAttribute('aria-labelledby', 'preferences-title');
    document.body.append(this.dialog);
    this.dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const controls = [...this.dialog.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), summary, a[href], [tabindex="0"]')]
        .filter(node => node.getClientRects().length > 0 && node.checkVisibility());
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    });
    this.dialog.addEventListener('close', () => {
      this.generation++;
      this.pending = null;
      this.plan = null;
      document.getElementById('open-preferences')?.focus();
    });
    this.dialog.addEventListener('click', event => {
      const button = (event.target as Element).closest<HTMLButtonElement>('button');
      if (!button) return;
      if (button.dataset.dialogAction === 'close') { this.dialog.close(); return; }
      if (this.busy) return;
      switch (button.dataset.dialogAction) {
        case 'export':
          this.attempt(() => {
            this.download(exportBackup(this.host.state()), 'verse-recall-backup.verse-recall.json');
            this.message('Backup downloaded. It contains private personal verses, progress and typed answers. Transfer it securely to your own device.');
          });
          break;
        case 'template':
          this.download(JSON.stringify(verseTemplate, null, 2), 'verse-recall-verses-template.json');
          this.message('Template downloaded. Replace the original sample with text you are permitted to use.');
          break;
        case 'cancel-import':
          this.pending = null;
          this.plan = null;
          this.dialog.querySelector('#import-preview')!.replaceChildren();
          this.message('Import cancelled. Nothing changed.');
          this.dialog.querySelector<HTMLElement>('#dialog-message')!.focus();
          break;
        case 'confirm-import':
          this.attempt(() => {
            if (!this.plan) throw new Error('Preview a file before confirming.');
            if (this.host.storageSnapshot() !== this.storageBefore) throw new Error('Device data changed after the preview, possibly in another tab. Reload before importing.');
            const next = confirmImport(this.host.state(), this.plan);
            this.host.applyImport(next);
            this.pending = null;
            this.plan = null;
            this.render();
            this.message(this.host.saveProblem() ?? 'Import applied and saved on this device. Personal verses are in the Personal verses collection.', Boolean(this.host.saveProblem()));
            this.dialog.querySelector<HTMLElement>('#dialog-message')!.focus();
          });
          break;
      }
    });
    this.dialog.addEventListener('change', event => {
      const input = event.target;
      if (input instanceof HTMLSelectElement && input.hasAttribute('data-preference')) {
        const key = input.id as keyof Preferences;
        this.host.changePreferences({ [key]: input.value });
        this.clearPreview(this.plan ? 'Preference updated. The import preview was cleared; preview the file again.' : 'Preferences saved on this device.');
        if (this.host.saveProblem()) this.message(this.host.saveProblem()!, true);
      } else if (input instanceof HTMLSelectElement && input.id === 'edit-verse') {
        this.fillForm(input.value);
      } else if (input instanceof HTMLInputElement && input.id === 'import-file') {
        const file = input.files?.[0];
        if (file) void this.readImport(file);
      } else if (input instanceof HTMLInputElement && input.hasAttribute('data-merge-option')) {
        this.attempt(() => this.preview());
        this.dialog.querySelector<HTMLElement>(`#${input.id}`)?.focus();
      }
    });
    this.dialog.addEventListener('input', event => {
      if (this.plan && (event.target as Element).closest('#verse-form')) this.clearPreview('Verse fields changed. Preview again before importing.');
    });
    this.dialog.addEventListener('submit', event => {
      event.preventDefault();
      if ((event.target as Element).id === 'verse-form') void this.prepareVerse();
    });
  }
  open(section?: 'personal' | 'transfer'): void {
    if (this.dialog.open) return;
    this.busy = false;
    this.render();
    this.dialog.showModal();
    if (section) this.dialog.querySelector<HTMLDetailsElement>(`#${section}-panel`)!.open = true;
    this.dialog.querySelector<HTMLButtonElement>('[data-dialog-action="close"]')!.focus();
  }
  private render(): void {
    const state = this.host.state();
    const p = state.preferences;
    this.dialog.innerHTML = `<div class="dialog-heading"><div><p class="eyebrow">MAKE YOURSELF AT HOME</p><h2 id="preferences-title">Preferences</h2></div><button type="button" data-dialog-action="close" aria-label="Close preferences">Close ×</button></div>
      <div class="dialog-content"><section aria-labelledby="appearance-heading"><h3 id="appearance-heading">Your reading space</h3>
      <div class="settings-grid">
        <label>Collection<select id="translation" data-preference>${options(p.translation, [['webbe', 'WEB British'], ['bsb', 'BSB'], ['personal', 'Personal verses']])}</select></label>
        <label>New passages<select id="filter" data-preference>${options(p.filter, [['both', 'Both Testaments'], ['OT', 'Old Testament'], ['NT', 'New Testament']])}</select></label>
        <label>Appearance<select id="preset" data-preference>${options(p.preset, [['calm', 'Calm'], ['study', 'Study'], ['focus', 'Focus']])}</select></label>
        <label>Colour mode<select id="colour" data-preference>${options(p.colour, [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']])}</select></label>
        <label>Theme colour<select id="accent" data-preference>${options(p.accent, [['purple', 'Purple'], ['blue', 'Blue'], ['green', 'Green'], ['rose', 'Rose'], ['neutral', 'Neutral']])}</select></label>
        <label>App font<select id="font" data-preference>${options(p.font, [['mono', 'Consolas'], ['segoe', 'Segoe UI'], ['aptos', 'Aptos'], ['calibri', 'Calibri']])}</select></label>
      </div><p class="font-preview verse">Joshua 1:8</p>
      <p class="small">Defaults: Consolas and Purple. Calm: soft surfaces. Study: crisp structure. Focus: larger verse text. Your app font applies to all text and controls, using device-local fallbacks. These choices do not reset your exercise or reviews.</p></section>
      <details id="personal-panel"><summary>Personal verses <span class="small">· ${state.personal.length}/100</span></summary>
        <p class="small">Your own text, kept privately on this device. Not independently verified. Enter only text you are permitted to use; import does not grant redistribution rights.</p>
        <label>Add or edit<select id="edit-verse"><option value="">Add a new verse</option>${state.personal.map(v => `<option value="${e(v.id)}">${e(v.reference)} · ${e(v.translationLabel)}</option>`).join('')}</select></label>
        <form id="verse-form"><div class="settings-grid">
          <label>Reference<input id="verse-reference" name="reference" required maxlength="120" placeholder="For example, Psalm 119:11"></label>
          <label>Testament<select id="verse-testament" name="testament"><option value="OT">Old Testament</option><option value="NT">New Testament</option></select></label>
          <label>Translation label<input id="verse-translation" name="translationLabel" required maxlength="80" placeholder="The translation you are using"></label>
          <label>Edition / version<input id="verse-edition" name="edition" required maxlength="80" placeholder="For example, my 2026 edition"></label>
        </div><label>Original text<textarea id="verse-text" name="text" required maxlength="2000" rows="5" placeholder="Enter the original wording, including punctuation."></textarea></label>
        <p class="small">1–120 words, at most 2,000 characters. Editing text or metadata creates a new content revision and resets only that verse's progress after confirmation.</p>
        <button type="submit" class="primary">Preview verse</button></form>
      </details>
      <details id="transfer-panel"><summary>Import, export & device transfer</summary>
        <p class="small">Export a JSON backup here, move it securely to your other device, then open Verse Recall there and import it below. No cloud sync or upload occurs. Backups contain private text, progress and typed answers; anyone with the file can read them.</p>
        <div class="actions"><button type="button" data-dialog-action="export">Export backup</button><button type="button" data-dialog-action="template">Download verse template</button></div>
        <label class="file-label">Import verses or backup (JSON, max 1 MiB)<input type="file" id="import-file" accept=".json,application/json"></label>
        <p class="small">Every file is validated before changes. Preview and confirm to merge; unrelated passages and reviews are never removed. Existing progress is kept unless you explicitly choose replacement.</p>
      </details>
      <div id="dialog-message" role="status" aria-live="polite" tabindex="-1"></div><section id="import-preview" aria-label="Import preview"></section></div>`;
  }
  private message(text: string, error = false): void {
    const node = this.dialog.querySelector<HTMLElement>('#dialog-message')!;
    node.setAttribute('role', error ? 'alert' : 'status');
    node.className = error ? 'dialog-error' : 'dialog-message';
    node.textContent = text;
    if (error) node.scrollIntoView({ block: 'nearest' });
  }
  private attempt(action: () => void): void {
    try { action(); }
    catch (error) { this.message(error instanceof Error ? error.message : 'This action failed. Nothing was imported.', true); }
  }
  private clearPreview(message: string): void {
    this.generation++;
    this.pending = null;
    this.plan = null;
    this.dialog.querySelector('#import-preview')!.replaceChildren();
    this.message(message);
  }
  private fillForm(id: string): void {
    const v = this.host.state().personal.find(verse => verse.id === id);
    for (const [field, value] of Object.entries({
      'verse-reference': v?.reference ?? '', 'verse-translation': v?.translationLabel ?? '',
      'verse-edition': v?.edition ?? '', 'verse-testament': v?.testament ?? 'OT', 'verse-text': v?.text ?? '',
    })) (this.dialog.querySelector(`#${field}`) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value = value;
    this.clearPreview('Edit the fields, then preview your changes.');
  }
  private async prepareVerse(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const generation = ++this.generation;
    try {
      if (this.host.protectedSave()) throw new Error('Resolve the unreadable-save notice on the main page before adding or importing data.');
      const form = new FormData(this.dialog.querySelector<HTMLFormElement>('#verse-form')!);
      const id = this.dialog.querySelector<HTMLSelectElement>('#edit-verse')!.value || undefined;
      const testament = form.get('testament');
      if (testament !== 'OT' && testament !== 'NT') throw new Error('Choose a Testament.');
      const verse = await makePersonal({
        reference: String(form.get('reference')), text: String(form.get('text')),
        translationLabel: String(form.get('translationLabel')), edition: String(form.get('edition')), testament,
      }, id);
      if (generation !== this.generation) return;
      this.pending = { kind: 'verses', personal: [verse] };
      this.storageBefore = this.host.storageSnapshot();
      this.preview(true);
    } catch (error) { if (generation === this.generation) this.message(error instanceof Error ? error.message : 'Could not prepare this verse.', true); }
    finally { this.busy = false; }
  }
  private async readImport(file: File): Promise<void> {
    const generation = ++this.generation;
    this.pending = null;
    this.plan = null;
    this.dialog.querySelector('#import-preview')!.replaceChildren();
    this.message('Validating locally… Nothing has changed.');
    this.busy = true;
    try {
      if (this.host.protectedSave()) throw new Error('Resolve the unreadable-save notice on the main page before importing data.');
      if (file.size > MAX_JSON_BYTES) throw new Error('JSON files must be no larger than 1 MiB.');
      const payload = await parseImport(await file.text());
      if (generation !== this.generation) return;
      this.pending = payload;
      this.storageBefore = this.host.storageSnapshot();
      this.preview(true);
    } catch (error) { if (generation === this.generation) this.message(error instanceof Error ? error.message : 'Could not read this file. Nothing has changed.', true); }
    finally {
      this.busy = false;
      const input = this.dialog.querySelector<HTMLInputElement>('#import-file');
      if (input) input.value = '';
    }
  }
  private preview(resetOptions = false): void {
    if (!this.pending) return;
    const getChecked = (id: string, fallback: boolean) => resetOptions ? fallback : this.dialog.querySelector<HTMLInputElement>(`#${id}`)?.checked ?? fallback;
    const merge = {
      preferences: getChecked('merge-preferences', defaultMergeOptions.preferences),
      replaceProgressAndSession: getChecked('merge-replace', defaultMergeOptions.replaceProgressAndSession),
    };
    this.plan = planImport(this.host.state(), this.pending, merge);
    const p = this.plan;
    const verses = this.pending.kind === 'backup' ? this.pending.state.personal : this.pending.personal;
    this.dialog.querySelector('#import-preview')!.innerHTML = `<h3 tabindex="-1" id="preview-heading">Review before importing</h3>
      <p>${p.added} new · ${p.updated} updated · ${p.duplicates} duplicate verse(s).</p>
      <p>${p.progressAdded} new progress · ${p.progressKept} existing kept · ${p.progressReplaced} replaced.</p>
      ${verses.length ? `<details><summary>Passages in this import (${verses.length})</summary>${verses.map(v => `<p><strong>${e(v.reference)}</strong> · ${e(v.translationLabel)} · ${e(v.edition)} · ${v.testament}</p><p class="small">${e(v.text)}</p>`).join('')}</details>` : ''}
      ${this.pending.kind === 'backup' ? `<label class="checkbox-label"><input id="merge-preferences" type="checkbox" data-merge-option ${merge.preferences ? 'checked' : ''}>Use the backup's preferences</label>
      <label class="checkbox-label"><input id="merge-replace" type="checkbox" data-merge-option ${merge.replaceProgressAndSession ? 'checked' : ''}>Replace matching progress and my current session with the backup</label>` : '<p class="small">Personal verses will be selected, with Both Testaments. Your current puzzle is kept unless its own text is being changed.</p>'}
      ${p.warnings.length ? `<ul>${p.warnings.map(w => `<li>${e(w)}</li>`).join('')}</ul>` : ''}
      <p class="small">Unrelated content stays. Text/metadata revisions cannot inherit the previous wording's progress. Imported personal text is not independently verified and carries no new redistribution permission.</p>
      <div class="actions"><button type="button" class="primary" data-dialog-action="confirm-import">Confirm import</button><button type="button" data-dialog-action="cancel-import">Cancel import</button></div>`;
    this.message('Validated. Nothing changes until you confirm.');
    if (resetOptions) this.dialog.querySelector<HTMLElement>('#preview-heading')!.focus();
  }
  private download(raw: string, name: string): void {
    const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
