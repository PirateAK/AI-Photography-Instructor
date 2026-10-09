import { useStore } from "./state/store";
import UploadScreen from "./components/UploadScreen";
import Workspace from "./components/Workspace";
import SettingsScreen from "./components/SettingsScreen";
import ClassesScreen from "./components/ClassesScreen";
import ErrorBoundary from "./components/ErrorBoundary";

export default function App() {
  const screen = useStore((s) => s.screen);
  return (
    <ErrorBoundary key={screen}>
      {screen === "workspace" ? (
        <Workspace />
      ) : screen === "settings" ? (
        <SettingsScreen />
      ) : screen === "classes" ? (
        <ClassesScreen />
      ) : (
        <UploadScreen />
      )}
    </ErrorBoundary>
  );
}
