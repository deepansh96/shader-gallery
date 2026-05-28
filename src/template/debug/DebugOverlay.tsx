import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";

export function DebugOverlay() {
  const gl = useThree((state) => state.gl);
  const panelRef = useRef<HTMLDivElement>(null);
  const lastTime = useRef(performance.now());
  const frames = useRef(0);
  const fps = useRef(0);
  const frameMs = useRef(0);

  useFrame(() => {
    const now = performance.now();
    frames.current += 1;
    frameMs.current = now - lastTime.current;

    if (now - lastTime.current >= 500) {
      fps.current = Math.round((frames.current * 1000) / (now - lastTime.current));
      frames.current = 0;
      lastTime.current = now;

      const info = gl.info;
      if (panelRef.current) {
        panelRef.current.innerHTML = [
          `<strong>${fps.current} fps</strong>`,
          `${frameMs.current.toFixed(1)} ms`,
          `geo ${info.memory.geometries}`,
          `tex ${info.memory.textures}`,
          `programs ${info.programs?.length ?? 0}`,
          `calls ${info.render.calls}`,
        ].join("<br />");
      }
    }
  });

  return (
    <Html fullscreen>
      <div className="debug-stats" ref={panelRef} />
    </Html>
  );
}
