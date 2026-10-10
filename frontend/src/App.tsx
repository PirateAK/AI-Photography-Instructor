import { useStore } from "./state/store";
import UploadScreen from "./components/UploadScreen";
import Workspace from "./components/Workspace";
import SettingsScreen from "./components/SettingsScreen";
import ClassesScreen from "./components/ClassesScreen";
import StyleManagerScreen from "./components/StyleManagerScreen";
import CourseManagerScreen from "./components/CourseManagerScreen";
import InstructorDashboard from "./components/InstructorDashboard";
import ProgressScreen from "./components/ProgressScreen";
import ErrorBoundary from "./components/ErrorBoundary";
import { useEffect } from "react";

export default function App() {
  const screen = useStore((s) => s.screen);

  useEffect(() => {
    // pick up manual edits to shooting_styles.json / training_courses.json made outside the app
    void useStore.getState().reloadStyles();
    void useStore.getState().reloadCourses();
  }, []);

  return (
    <ErrorBoundary key={screen}>
      {screen === "workspace" ? (
        <Workspace />
      ) : screen === "settings" ? (
        <SettingsScreen />
      ) : screen === "classes" ? (
        <ClassesScreen />
      ) : screen === "stylemanager" ? (
        <StyleManagerScreen />
      ) : screen === "coursemanager" ? (
        <CourseManagerScreen />
      ) : screen === "instructor" ? (
        <InstructorDashboard />
      ) : screen === "progress" ? (
        <ProgressScreen />
      ) : (
        <UploadScreen />
      )}
    </ErrorBoundary>
  );
}
