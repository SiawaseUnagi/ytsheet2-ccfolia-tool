import { sessionBridge } from "./main";
import { mountEditorLayout } from "./editor/layout";
import { mountEditorTools } from "./editor/tools";
import { mountInventoryHelp } from "./editor/inventoryHelp";
import { mountSessionTools } from "./session/ui";
mountEditorTools();
mountSessionTools(sessionBridge);
// Assemble the final guide once, after the tools have added their controls.
mountEditorLayout();
mountInventoryHelp();
