import { Canvas } from "@react-three/fiber";
import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import type { GalleryItemDefinition, GalleryParamValue } from "../gallery/types";
import { DebugOverlay } from "./debug/DebugOverlay";
import { TweakpaneControls } from "./debug/TweakpaneControls";

type ShaderStageProps = {
  item: GalleryItemDefinition;
  debug: boolean;
};

export function ShaderStage({ item, debug }: ShaderStageProps) {
  const initialParams = useMemo(
    () => Object.fromEntries(item.params.map((param) => [param.key, param.value])),
    [item.params],
  );
  const [params, setParams] = useState<Record<string, GalleryParamValue>>(initialParams);
  const Scene = item.component;

  return (
    <main className="stage-shell">
      <Canvas
        className="stage-canvas"
        camera={{ position: [0, 0, 1], fov: 45, near: 0.1, far: 10 }}
        dpr={[1, 1.75]}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        }}
      >
        <color attach="background" args={["#03030a"]} />
        <Scene params={params} debug={debug} />
        {debug ? <DebugOverlay /> : null}
      </Canvas>

      <div className="stage-chrome">
        <Link to="/" className="back-link">
          Gallery
        </Link>
        <div>
          <p>{item.status}</p>
          <h1>{item.title}</h1>
        </div>
      </div>

      {debug ? (
        <TweakpaneControls definitions={item.params} values={params} onChange={setParams} />
      ) : null}
    </main>
  );
}
