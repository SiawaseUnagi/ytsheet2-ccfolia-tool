import { sessionBridge } from "./main";
import { mountEditorTools } from "./editor/tools";
import { mountSessionTools } from "./session/ui";
mountEditorTools();
mountSessionTools(sessionBridge);
