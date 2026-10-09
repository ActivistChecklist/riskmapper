/**
 * Plain-text copies are Markdown, and people paste them into renderers
 * (GitHub, HackMD, Obsidian, Notion) that fetch images. Text written by
 * someone else, through a shared link or an imported matrix file, could
 * carry `![](https://tracker.example/p.gif)` or `<img src=...>`, and then
 * whoever renders the paste would contact a third party.
 *
 * Only the two constructs that make a renderer fetch something are escaped:
 * image syntax (`![`, which also covers reference-style images) and raw
 * HTML (`<`). Ordinary emphasis and links stay readable, and a plain link
 * fetches nothing until someone clicks it.
 */
export function escapeMarkdownFetches(text: string): string {
  return text.replace(/!\[/g, "!\\[").replace(/</g, "\\<");
}
