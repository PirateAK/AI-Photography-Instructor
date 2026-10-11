import { useEffect, useState } from "react";
import { useStore } from "./state/store";
import { canManageContent } from "./lib/training";
import UploadScreen from "./components/UploadScreen";
import Workspace from "./components/Workspace";
import SettingsScreen from "./components/SettingsScreen";
import ClassesScreen from "./components/ClassesScreen";
import StyleManagerScreen from "./components/StyleManagerScreen";
import CourseManagerScreen from "./components/CourseManagerScreen";
import InstructorDashboard from "./components/InstructorDashboard";
import AccessGate from "./components/AccessGate";
import ProgressScreen from "./components/ProgressScreen";
import ChallengeScreen from "./components/ChallengeScreen";
import ErrorBoundary from "./components/ErrorBoundary";

export default function App() {
  const screen = useStore((s) => s.screen);
  const instructorUnlocked = useStore((s) => s.instructorUnlocked);
  const photoLoading = useStore((s) => s.photoLoading);
  const [accessOk, setAccessOk] = useState(() => localStorage.getItem("site-access-ok") === "1");

  useEffect(() => {
    // pick up manual edits to shooting_styles.json / training_courses.json made outside the app
    void useStore.getState().reloadStyles();
    void useStore.getState().reloadCourses();
    // restore the on-device photo gallery (IndexedDB)
    void useStore.getState().loadGallery();
  }, []);

  // manager screens are gated behind the instructor code / future Pro upgrade —
  // a locked user can never land on them, even via stale navigation state
  const managed =
    !canManageContent({ instructorUnlocked }) &&
    (screen === "stylemanager" || screen === "coursemanager" || screen === "settings");
  const guardedScreen = managed ? "upload" : screen;

  // the published app sits behind the access code — nothing renders until it's entered
  if (!accessOk) {
    return <AccessGate onUnlock={() => setAccessOk(true)} />;
  }

  return (
    <>
      <ErrorBoundary key={guardedScreen}>
        {guardedScreen === "workspace" ? (
          <Workspace />
        ) : guardedScreen === "settings" ? (
          <SettingsScreen />
        ) : guardedScreen === "classes" ? (
          <ClassesScreen />
        ) : guardedScreen === "stylemanager" ? (
          <StyleManagerScreen />
        ) : guardedScreen === "coursemanager" ? (
          <CourseManagerScreen />
        ) : guardedScreen === "instructor" ? (
          <InstructorDashboard />
        ) : guardedScreen === "progress" ? (
          <ProgressScreen />
        ) : guardedScreen === "challenge" ? (
          <ChallengeScreen />
        ) : (
          <UploadScreen />
        )}
      </ErrorBoundary>
      {photoLoading && (
        <div className="photo-loading-pill" role="status">
          ⏳ Loading photo…
        </div>
      )}
    </>
  );
}
