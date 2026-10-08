# Rendering performance

The optimization pass preserves layer counts, data providers, controls, replay, marker artwork, globe shaders, imagery detail, and panel styles.

## Changes

- Scene snapshots batch entity notifications and perform one global visibility/chart refresh request, rather than twelve. Individual feed updates also batch notifications.
- Chart and panel refreshes coalesce within a browser frame; every feed observation is still processed.
- Moving markers share a geographic sample across their icon, stem, and trail. Sampling preserves dateline wrapping and the existing 15-second prediction limit. Cartesian stem and traffic scratch buffers are reused.
- Stationary layers use constant position/geometry properties, updated when telemetry changes, rather than continuous callbacks. Aircraft heading updates with telemetry.
- Satellite propagation endpoints are staggered across the second and reuse the previous next endpoint. Replay jumps and changed TLEs invalidate cached endpoints.
- Hover picking pauses during camera gestures. Traffic animation runs on the scene update cadence rather than a second animation loop.
- Slow camera gestures adapt pixel resolution, with full original resolution restored 200 ms after movement ends. This temporarily softens the globe during an expensive gesture; shaders, layers, imagery LOD and controls remain enabled. Fast devices keep their normal resolution unless slow frames are detected.
- Constrained devices retain fewer unused globe tiles in GPU memory; currently visible tiles and maximum imagery detail are unchanged. Local imagery/assets use a one-hour public browser cache; API responses and application code remain uncached.
- Rendering suspends while the page is hidden and resumes on return. Camera telemetry DOM attributes update at most four times per second.

## Validation

Run `npm test`, `npm run build`, and `npm run benchmark`.

The deterministic scene-refresh regression exercises the actual application functions: twelve visibility/chart passes before the fix, one after, with every entity layer still processed. The sampling benchmark uses 2,000 moving markers over 120 frames with three consumers. On the local Node.js run, median uncached sampling was 100.83 ms and cached sampling was 45.53 ms (five runs each), with matching positions. These are isolated CPU measurements, not whole-application FPS or guarantees for a particular GPU.

Browser verification used a synthetic offline scene with 1,200 aircraft, 600 cameras and 60 satellites, including propagated TLE data. Realistic/visibility surfaces, zoom, 2D/3D switching, and the live connection were checked without rendering errors. No synthetic records are included in the repository or release. A physical low-end device was not available for device-specific FPS measurements.

For deployment, retain private environment settings and persistent data. Upload the optimized release, restart the server, then reload the browser. The release does not change proxy/origin settings or include credentials.
