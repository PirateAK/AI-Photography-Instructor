import { useStore } from "./state/store";
import UploadScreen from "./components/UploadScreen";
import Workspace from "./components/Workspace";
import SettingsScreen from "./components/SettingsScreen";

export default function App() {
  const screen = useStore((s) => s.screen);
  if (screen === "workspace") return <Workspace />;
  if (screen === "settings") return <SettingsScreen />;
  return <UploadScreen />;
}
