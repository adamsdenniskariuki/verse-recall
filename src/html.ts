export const escapeHtml = (value: string | number): string => String(value).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export function options<T extends string>(current: T, values: readonly [T, string][]): string {
  return values.map(([value, text]) => `<option value="${escapeHtml(value)}" ${value === current ? 'selected' : ''}>${escapeHtml(text)}</option>`).join('');
}
