// Shared keyboard helpers. Single place for the "am I typing?" guard so
// global and grid shortcuts never fire while the user is in a text field.

/** True when the event target is a text-entry control (input, textarea,
 *  select, or contenteditable). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  )
}
