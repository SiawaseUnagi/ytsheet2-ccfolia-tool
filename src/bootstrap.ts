import { sessionBridge } from "./main";
import { mountEditorLayout } from "./editor/layout";
import { mountEditorTools } from "./editor/tools";
import { mountSessionTools } from "./session/ui";
mountEditorTools();
mountSessionTools(sessionBridge);
// Assemble the final guide once, after the tools have added their controls.
mountEditorLayout();
