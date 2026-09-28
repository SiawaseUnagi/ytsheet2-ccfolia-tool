/** Editor sizing is presentation only, never persisted with character data. */
export function mountEditorLayout(): void {
  if (document.getElementById("resizableEditors")) return;
  const style = document.createElement("style");
  style.id = "resizableEditors";
  style.textContent = `
#statusEdit, #paramsEdit, #vars, #palette { display:block; resize:both; overflow:auto; min-width:12rem; min-height:6rem; max-width:100%; }
@media (hover:hover) and (pointer:fine) { #statusEdit, #paramsEdit, #vars, #palette { max-width:calc(100vw - 32px); } }
#usageInstructions pre { white-space:pre-wrap; overflow-wrap:anywhere; }
#usageInstructions blockquote { margin:12px 0; padding:8px 12px; border-left:3px solid #ccc; }
`;
  document.head.append(style);
}
