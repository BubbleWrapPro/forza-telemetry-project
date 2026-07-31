# Implementation Plan - Landing Page for Forza Telemetry

This plan aims to replace the direct login entry with a project presentation landing page. The landing page will introduce the project, highlight its features, provide a download link for the agent, and offer a button to proceed to the login/registration screen.

## User Review Required

> [!IMPORTANT]
> The landing page will become the new entry point of the application. The login screen will only be accessible after clicking a button on the landing page.
> Please confirm if you have a specific GitHub repository URL for the "Latest Release" link. I will use a placeholder for now.

## Proposed Changes

### Dashboard Client

#### [MODIFY] [App.jsx](file:///C:/Users/Thomas/Documents/GitHub/forza-telemetry-project/dashboard-client/src/App.jsx)
- **State Management**:
    - Add `currentView` state variable (default: `'landing'`).
    - Update `useEffect` (session restoration) to skip landing if a session is already active.
- **Rendering Logic**:
    - Wrap the current auth form in a conditional check for `currentView === 'auth'`.
    - Create a new `renderLandingPage()` function or inline JSX to display the presentation page.
    - Landing page content will be derived from the `README.md`.
- **Navigation**:
    - Add a "Commencer l'Analyse" button on the landing page to switch `currentView` to `'auth'`.
    - Add a "Retour à l'accueil" button on the login screen to return to the landing page.

#### [MODIFY] [App.css](file:///C:/Users/Thomas/Documents/GitHub/forza-telemetry-project/dashboard-client/src/App.css)
- Add styles for the landing page:
    - Hero section with title and subtitle.
    - Feature grid or list.
    - Download card/section.
    - Responsive layout adjustments.

## Verification Plan

### Manual Verification
- **New Flow**: Verify that opening the app shows the Landing Page first.
- **Navigation**: Click the button and ensure it leads to the Login/Register form.
- **Session Persistence**: Ensure that if the user was already logged in, they bypass both landing and login and go straight to the dashboard.
- **Download Link**: Verify the GitHub release link is visible and functional.
- **Content**: Ensure the project description reflects the info from the README.
