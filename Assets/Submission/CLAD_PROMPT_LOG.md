# Spatial Director Studio — CLAD Prompt Log

**Hackathon project:** Spatial Director Studio  
**Platform:** Snap Spectacles / Lens Studio  
**AI development workflow:** ChatGPT using CLAD and the connected Lens Studio MCP  
**Development session:** September 4–5, 2026

## About this log

This is a curated transcript of the prompts that guided the design and development of Spatial Director Studio. Repeated debugging requests have been consolidated, and wording has been lightly cleaned for readability while preserving the original intent. Passwords, API keys, service-role keys, account details, and unrelated conversation have been excluded.

CLAD was used as an active AI co-developer rather than only as a code generator. Through the Lens Studio connection it inspected the project, checked available APIs and packages, constructed and modified the scene, created TypeScript components, wired object references, compiled scripts, inspected Preview behavior and runtime logs, diagnosed visual and interaction problems, and iterated on the experience. Supporting web/backend work was also created and tested alongside the Lens project.

---

## 1. Product concept and feasibility

### Prompt

> I’m working on a hackathon project called **Spatial Director Studio** for Snap Spectacles using Lens Studio. The idea is to turn the user’s physical space into a virtual film set.
>
> The user should be able to place and manipulate 3D characters, spawn and position virtual lights, place multiple virtual cameras and viewfinders, trigger character animations, create a camera sequence, switch cameras like a live director, record the final Program Camera output, and send the result to a web dashboard.
>
> The core workflow is: **PLACE CHARACTER → PLACE LIGHTS → PLACE CAMERAS → SET SHOTS → PLAY ANIMATION → DIRECT/SWITCH CAMERAS → RECORD → SEND FINAL VIDEO TO WEB.**
>
> Investigate what is actually possible with current Spectacles and Lens Studio APIs. Do not assume a normal web or Unity workflow will work. Use Lens Studio MCP and the available project resources to assess feasibility, the strongest MVP, recording and transfer options, risks, and what would make the demo impressive.

### CLAD-assisted workflow and result

- Inspected the available Lens Studio/Spectacles APIs, packages, examples, and project capabilities.
- Separated the authoring camera from a dedicated Program Camera.
- Chose ordered JPEG capture from a controlled RenderTarget as the practical MVP recording path instead of assuming direct MP4 export.
- Proposed a frame manifest, cloud upload, backend FFmpeg processing, and web dashboard pipeline.
- Identified Preview limitations and kept device-only hand interaction separate from Preview-testable behavior.

---

## 2. Concrete MVP architecture

### Prompt

> Now that the concept is validated, inspect the current Lens Studio project and available Spectacles/Lens Studio resources, APIs, examples, and MCP tools. Create a concrete MVP architecture before writing code.
>
> Break it into: scene and character placement, character manipulation, virtual lighting, virtual camera rigs, Program Camera and switching, animation playback, director timeline, recording/frame capture, Snap Cloud upload, backend/video processing, web dashboard, and CLAD integration.
>
> For every module explain the APIs or Lens Studio features to use, TypeScript work, existing components, dependencies, limitations, and risks. Then propose the smallest end-to-end MVP.

### CLAD-assisted workflow and result

- Produced a modular architecture centered on Lens Studio TypeScript components.
- Defined a `Shot[]` sequence model containing camera identity, shot duration, and action.
- Planned independent modules for camera rigs, character animation, capture, cloud upload, UI, backend processing, and dashboard playback.
- Established an implementation order that delivered a complete vertical slice before optional features.

---

## 3. Start the complete build in the actual Lens project

### Prompt

> The project is saved in the Lens Studio project folder. Build the complete Spatial Director Studio MVP in one continuous effort. Use ChatGPT with the CLAD skill throughout the development process.
>
> Use CLAD to inspect, modify, construct, compile, test, debug, and verify the actual project through Lens Studio MCP. Do not only give me code or instructions. Make the changes in the project.
>
> Build spatial authoring, lighting, visible camera rigs, a separate Program Camera and monitor, character animation, a shot sequencer, manual camera switching, JPEG-frame capture, Supabase upload, FFmpeg MP4 processing, and a web dashboard. Compile and verify each major step and do not leave known TypeScript errors or broken references.

### CLAD-assisted workflow and result

- Inspected the saved hierarchy, assets, installed packages, scripts, and existing SIK setup.
- Built and wired the main Lens components in TypeScript.
- Preserved useful SIK resources and disabled or removed unrelated example content.
- Repeatedly compiled and checked runtime logs while constructing the end-to-end workflow.

---

## 4. Remove unused example UI and prioritize a polished end-to-end experience

### Prompt

> Delete the unwanted UI examples that are not used by Spatial Director Studio. Keep testing the MVP in Preview, fix bugs you find, and make the experience intuitive and engaging. The UI and UX should feel polished enough for a hackathon demonstration.

### CLAD-assisted workflow and result

- Removed/disabled unrelated sample experiences that cluttered the scene.
- Focused the hierarchy and runtime on the Spatial Director experience.
- Added clearer status, guide, timeline, capture, and inventory feedback.
- Used Preview captures and runtime inspection to iterate on readability and flow.

---

## 5. Give cameras and lights visible physical proxies

### Prompt

> Lens Studio camera and light objects are not visible to the wearer. Attach each virtual camera to an actual camera-on-tripod 3D model so moving the model moves the camera. Do the same for lights and any other invisible authoring objects. Create the required models with Blender MCP if necessary.

### CLAD-assisted workflow and result

- Created/imported visible camera tripod and studio-light assets.
- Bound the invisible camera and LightSource behavior to the visible spatial rigs.
- Added solid, readable materials so authoring proxies were clearly visible in the Lens.
- Kept the physical proxy, collider, manipulation behavior, and functional camera/light transform synchronized.

---

## 6. Editable camera duration and tripod height controls

### Prompt

> Add a compact black control UI to each camera. It needs two individual controls: tripod height and recording duration. The duration control should use small tick lines with a center pointer/arrow, similar to a physical timer. Each camera’s duration becomes that camera’s shot length in the director sequence.
>
> Only show the controls for the selected camera. Do not show every camera panel at once.

### CLAD-assisted workflow and result

- Added per-camera duration and height state.
- Built compact rear-mounted controls with tick marks, a fixed selection pointer, and clear value feedback.
- Connected camera durations to the live `Shot[]` sequence and total take duration.
- Made only the selected rig’s controls visible to prevent visual clutter.

---

## 7. Correct tripod height behavior

### Prompt

> When the tripod height changes, do not move the whole tripod up and down. The feet should stay planted and the center column/legs should extend so the camera head changes height naturally.

### CLAD-assisted workflow and result

- Reworked height adjustment so the base remains grounded.
- Scaled/extended the tripod’s vertical structure and repositioned the camera head and attached control deck.
- Preserved the rig’s camera behavior while making the proxy read as a real adjustable tripod.

---

## 8. Light controls

### Prompt

> Add a compact control panel at the physical back of the studio light. It should have an intensity control and color selection. The panel must be visible when the light is selected, parallel to the rear of the light, and solid rather than transparent.

### CLAD-assisted workflow and result

- Added a rear light control deck that follows the light rig.
- Implemented an intensity slider and selectable color palette.
- Connected the controls directly to the Lens Studio `LightSource` intensity and color.
- Corrected panel orientation and selection visibility so the controls appear on the usable side of the light.

---

## 9. Recording and frame capture

### Prompt

> Finish capture using the Program Camera. Capture ordered JPEG frames at a practical MVP resolution and frame rate, persist and upload them, and include a manifest with take ID, frame order, FPS, duration, and shots. Keep memory use bounded.

### CLAD-assisted workflow and result

- Implemented Program RenderTarget capture at 512×288 and 12 FPS for the MVP.
- Created deterministic frame names and an ordered take manifest.
- Capped frame collection to avoid unbounded Spectacles memory use.
- Connected capture state to the in-Lens UI: recording, processing/upload, ready, and error.

---

## 10. Supabase / Snap Cloud integration

### Prompt

> We do not yet have Lens-integrated Supabase access. Can we use native Supabase temporarily? I have now created and logged into a Supabase account. Connect the project and prepare everything needed on the Supabase side without repeatedly asking me for information.

### CLAD-assisted workflow and result

- Added the Lens-side Supabase/Snap Cloud adapter using the available Lens Studio package.
- Added anonymous authentication, take database rows, Storage uploads, manifest upload, and job-state updates.
- Created the required SQL schema and storage policy setup.
- Kept privileged service-role credentials on the server side and out of the Lens/browser code.
- Retained a deterministic Preview mock so the Lens remains demonstrable when cloud configuration is unavailable.

---

## 11. Dashboard and MP4 processing

### Prompt

> Build the web dashboard with a take list, upload/processing/ready states, a video player, and download/share actions. The video must actually play, not display only one captured frame, and Download must return the finished video rather than a random JSON file.

### CLAD-assisted workflow and result

- Built a local companion dashboard with a professional take-browser layout.
- Added timestamp-driven JPEG-sequence playback when an MP4 is not yet available.
- Added native MP4 playback when processing has completed.
- Added correct manifest/video download handling and share-link copying.
- Added an FFmpeg worker that reads the ordered manifest, encodes H.264 MP4, uploads the result, and updates the take to Ready.

---

## 12. Capture the real-world background

### Prompt

> The captured result currently contains only the 3D characters. It also needs to capture the real camera background so the final shot contains the physical environment and the virtual scene together.

### CLAD-assisted workflow and result

- Added the device camera texture to the Program Camera render path.
- Corrected layers/render order so the background is composed behind the virtual characters, cameras, and lighting result.
- Re-tested the Program output rather than relying on the authoring/head camera view.

---

## 13. Professional dashboard layout

### Prompt

> Redesign the dashboard so it looks professional and sensible. Make the video panel use the available second-half space. Keep Take Details and Render Status as two sections at the bottom. Remove unnecessary delivery-pipeline information.

### CLAD-assisted workflow and result

- Reorganized the dashboard around the final media as the primary content.
- Expanded the player while retaining the existing overall page footprint.
- Simplified secondary metadata into Take Details and Render Status.
- Preserved useful actions without exposing implementation noise to the viewer.

---

## 14. Floating studio UI and attach/detach behavior

### Prompt

> The main UI should be a floating 3D screen, not a full-screen overlay. Add a button that lets the user attach it to their view or detach it into the world. When attached, it should follow both sideways and up/down movement without becoming tilted. When detached, it should remain upright and face the user.

### Follow-up debugging prompt

> The UI is rotated and tilted. Do not inherit unwanted camera roll or pitch. Keep the panel flat and readable in both attached and detached modes.

### CLAD-assisted workflow and result

- Converted the primary controls into a spatial panel.
- Added attach/detach behavior and camera-relative repositioning.
- Iterated on rotation handling to remove unwanted panel tilt.
- Preserved vertical following while keeping the interface upright and readable.

---

## 15. Welcome flow and empty studio

### Prompt

> Add a proper welcome screen, instructions, and start flow. Do not spawn cameras, lights, or characters by default. The user should add only what they need: one, two, or three cameras, optional light, and selected characters. One camera is valid; three is not a minimum requirement.

### CLAD-assisted workflow and result

- Changed startup to an empty studio rather than a pre-populated demo scene.
- Added a welcome/onboarding view and concise interaction guidance.
- Added on-demand Character, Camera, and Light controls with live inventory counts.
- Made sequence construction depend only on the cameras the user actually created.

---

## 16. Improve UI hierarchy and generic camera naming

### Prompt

> Improve the UI typography and hierarchy. Titles, labels, instructions, and status text should not all be the same size. Make the panel background solid for visibility and keep the buttons clear.
>
> Camera and light controls must sit exactly at the physical back of each model, parallel to the housing, not floating above it. Do not name cameras Wide, Close-up, or Walk. Let the user decide how each camera is used.

### CLAD-assisted workflow and result

- Added distinct title, section, body, status, and helper-text styles.
- Replaced low-contrast transparent control backgrounds with solid dark surfaces.
- Repositioned camera and light controls onto their rear faces.
- Renamed authored choices to neutral Camera 1, Camera 2, and Camera 3 labels.

---

## 17. Integrate the Program preview into the main UI

### Prompt

> Move the floating Program preview into the Spatial Director UI. Fit it into the existing panel without increasing the panel size. Use the unused top space or make the preview smaller.

### CLAD-assisted workflow and result

- Embedded the Program Camera viewfinder into the primary studio panel.
- Rebalanced the existing content instead of enlarging the UI.
- Kept the monitor synchronized with manual and sequenced camera cuts.

---

## 18. Spawn content in a predictable stage area

### Prompt

> Characters, cameras, and lights are spawning in random places. Spawn them in front of the user and beyond the UI, not between the UI and the user. Cameras and lights should continue facing the characters as before.

### Follow-up debugging prompt

> The cameras and lights are facing 180 degrees away from the character. Only the spawn position was meant to change. Fix the orientation so they aim toward the cast.

### CLAD-assisted workflow and result

- Added a camera-relative spawn frame in front of the user and beyond the UI.
- Spawned the character stage, camera rigs, and key light at predictable offsets.
- Corrected Lens Studio forward-axis assumptions so camera lenses and the light face the cast rather than away from it.

---

## 19. Multiple selectable Mixamo characters

### Prompt

> Replace the current single character with several cartoon characters from Mixamo. Add four character options and useful cinematic animations. When the user presses Character, open a 2×2 character panel with visible previews so they can choose whom to add. Allow multiple characters in the same scene.

### Follow-up prompt

> The character previews are not properly framed. Fit each complete character clearly inside its card. Also make more than one animation available for the sequence.

### CLAD-assisted workflow and result

- Imported four Mixamo character assets: Remy, Mousey, Ninja, and Doozy.
- Added a shared cinematic motion set including idle, run, kick/action, and fall.
- Built a 2×2 in-Lens character picker with live 3D previews.
- Adjusted preview scale and framing per character.
- Supported up to three active cast members and drove the cast through a coordinated sequence.

---

## 20. Preview-friendly 360-degree camera setup

### Prompt

> Manual two-hand rotation is not practical in Lens Studio Preview. Change only the camera spawn arrangement: place up to three cameras around the cast at 120-degree intervals so all sides are covered. Keep the rest of the application unchanged.

### CLAD-assisted workflow and result

- Updated the camera spawn calculation to distribute Camera 1/2/3 around the cast in 120° orbit steps.
- Aimed every spawned rig at the shared character focus point.
- Preserved manual movement for device use while making the Preview demo usable without simulated hand rotation.

---

## 21. Test and verify the complete workflow

### Prompt

> Test the Lens in Lens Studio Preview. Demonstrate the full editor workflow: start the experience, choose two characters, place the UI aside, add lights, add three cameras around the characters, show the camera and light controls, play the character performance, and demonstrate camera switching. Fix visible bugs before considering the result ready.

### CLAD-assisted workflow and result

- Compiled the Lens TypeScript and checked runtime logs.
- Exercised the empty-studio start flow, character picker, camera/light spawning, control visibility, shot sequence, Program Camera cuts, capture states, and dashboard handoff.
- Captured Preview validation images and a Lens Studio Preview demo recording.
- Kept actual Spectacles hardware QA explicitly separate because hardware was not available during this development session.

---

## Final AI-assisted implementation summary

CLAD helped turn the initial concept into a working vertical-slice creator tool with:

- A floating spatial director console with welcome, studio, and character-picker views.
- On-demand spawning of up to three characters, one light, and one to three cameras.
- Four Mixamo character choices with multiple cinematic animations.
- Visible solid camera-tripod and studio-light authoring rigs.
- Camera controls for tripod height and per-shot duration.
- Light controls for intensity and color.
- Automatic camera placement around the cast at 120° intervals.
- A dedicated Program Camera, integrated viewfinder, manual cuts, and timed shot sequence.
- 512×288, 12 FPS ordered JPEG capture with a take manifest.
- Supabase authentication, Storage upload, take records, and processing states.
- FFmpeg H.264 MP4 processing.
- A web dashboard with take selection, sequence/MP4 playback, details, render state, download, and share actions.

The human directed the product concept, feature priorities, visual references, interaction expectations, and each refinement. CLAD accelerated API investigation, scene construction, TypeScript implementation, asset wiring, compilation, Preview debugging, backend integration, and iterative QA. Final physical-device testing and hackathon publishing remain human-controlled steps.

