import { sessionBridge } from "./main";
import { mountEditorLayout } from "./editor/layout";
import { mountEditorTools } from "./editor/tools";
import { mountSessionTools } from "./session/ui";
mountEditorLayout();
mountEditorTools();
mountSessionTools(sessionBridge);
