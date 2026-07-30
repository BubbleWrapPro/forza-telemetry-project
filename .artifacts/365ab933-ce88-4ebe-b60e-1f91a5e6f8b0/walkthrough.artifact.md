# Full Forza Horizon 6 Telemetry & Dynamic Dashboard

I have successfully expanded the telemetry system to support all available data points from Forza Horizon 6 and implemented a customizable dashboard.

## Key Accomplishments

### 1. Full Telemetry Extraction (Relay Server)
The `relay-server/index.js` now parses the complete 324-byte UDP packet. New data points include:
- **Physics**: 3D Acceleration, 3D Velocity, 3D Angular Velocity, Yaw/Pitch/Roll.
- **Race Context**: Current/Best Lap times, Lap Number, Race Position, Fuel Level, Distance Traveled.
- **Vehicle Specs**: Car Class (D-X), Performance Index (PI), Drivetrain Type (FWD/RWD/AWD), Number of Cylinders.
- **Advanced Dynamics**: Turbo Boost, Clutch/Handbrake inputs, Wheel Rotation Speed, Puddle Depth, Surface Rumble intensity.

### 2. New UI Widgets
I've added several new cards to the dashboard:
- **Course & Session**: Track your position, laps, and fuel in real-time.
- **Véhicule**: View car specs like PI and Class.
- **Châssis Avancé**: Monitor high-precision velocity and rotation data.
- **Expert Roues**: Get technical details on wheel rotation and road surface conditions.

### 3. Dynamic Customization
You can now tailor the dashboard to your needs:
- Click the **"Personnaliser"** button in the header.
- Toggle visibility for each widget group.
- Your preferences are automatically saved in your browser's local storage.

## How to use

> [!IMPORTANT]
> 1. Ensure **Forza Horizon 6** is set to **Data Out: ON** and **Format: Dash** (324 bytes).
> 2. Restart your `relay-server` to apply the new parser logic.
> 3. Refresh the dashboard in your browser.
> 4. Use the **Personnaliser** button to hide or show widgets as you like.

## Technical Details

```javascript
// Example of the new telemetry structure sent to the dashboard
{
  isRaceOn: 1,
  fuel: 0.75, // 75%
  lapNumber: 3,
  racePosition: 5,
  boost: 1.2, // bar
  carPerformanceIndex: 850,
  // ... and many more
}
```

The UI uses a flexible CSS grid that automatically adapts as you show or hide widgets.
render_diffs(file:///C:/Users/Thomas/Documents/GitHub/forza-telemetry-project/relay-server/index.js)
render_diffs(file:///C:/Users/Thomas/Documents/GitHub/forza-telemetry-project/dashboard-client/src/App.jsx)
render_diffs(file:///C:/Users/Thomas/Documents/GitHub/forza-telemetry-project/dashboard-client/src/App.css)
