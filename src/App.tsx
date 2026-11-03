import * as React from "react";
import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { ProtectedRoute, PublicOnlyRoute } from "./components/ProtectedRoute";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/auth/LoginPage";
import SignupPage from "./pages/auth/SignupPage";
import OnboardingPage from "./pages/auth/OnboardingPage";
import DashboardPage from "./pages/DashboardPage";
import AutomationsPage from "./pages/AutomationsPage";
import NewAutomationPage from "./pages/NewAutomationPage";
import TemplatesPage from "./pages/TemplatesPage";
import HistoryPage from "./pages/HistoryPage";
import ExecutionDetailPage from "./pages/ExecutionDetailPage";
import IntegrationsPage from "./pages/IntegrationsPage";
import ConnectionsPage from "./pages/ConnectionsPage";
import GeneralSettingsPage from "./pages/settings/GeneralSettingsPage";
import NotificationSettingsPage from "./pages/settings/NotificationSettingsPage";
import WorkspaceSettingsPage from "./pages/settings/WorkspaceSettingsPage";
import BillingPage from "./pages/BillingPage";
import ProfilePage from "./pages/ProfilePage";
import HelpPage from "./pages/HelpPage";
import { PrivacyPage, TermsPage, ContactPage } from "./pages/LegalPages";
import NotFoundPage from "./pages/NotFoundPage";
import WorkflowEditorPage from "./pages/editor/WorkflowEditorPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />

      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <LoginPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/signup"
        element={
          <PublicOnlyRoute>
            <SignupPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute allowIncompleteOnboarding>
            <OnboardingPage />
          </ProtectedRoute>
        }
      />

      <Route path="/help" element={<HelpPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/contact" element={<ContactPage />} />

      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/automations" element={<AutomationsPage />} />
        <Route path="/automations/new" element={<NewAutomationPage />} />
        <Route path="/automations/:id" element={<WorkflowEditorPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/history/:id" element={<ExecutionDetailPage />} />
        <Route path="/integrations" element={<IntegrationsPage />} />
        <Route path="/connections" element={<ConnectionsPage />} />
        <Route path="/settings" element={<GeneralSettingsPage />} />
        <Route path="/settings/notifications" element={<NotificationSettingsPage />} />
        <Route path="/settings/workspace" element={<WorkspaceSettingsPage />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
