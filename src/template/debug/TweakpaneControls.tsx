import { Pane } from "tweakpane";
import { useEffect, useRef } from "react";
import type { GalleryParamDefinition, GalleryParamValue } from "../../gallery/types";

type PaneWithBindings = Pane & {
  addBinding: (
    params: Record<string, GalleryParamValue>,
    key: string,
    options: {
      label: string;
      min?: number;
      max?: number;
      step?: number;
      view?: "color";
    },
  ) => {
    on: (eventName: "change", callback: () => void) => void;
  };
};

type TweakpaneControlsProps = {
  definitions: GalleryParamDefinition[];
  values: Record<string, GalleryParamValue>;
  onChange: (values: Record<string, GalleryParamValue>) => void;
};

export function TweakpaneControls({ definitions, values, onChange }: TweakpaneControlsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const latestValues = useRef(values);

  useEffect(() => {
    latestValues.current = values;
  }, [values]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const params = { ...latestValues.current };
    const pane = new Pane({
      container: containerRef.current,
      title: "Shader Controls",
    }) as PaneWithBindings;

    for (const definition of definitions) {
      pane
        .addBinding(params, definition.key, {
          label: definition.label,
          min: definition.min,
          max: definition.max,
          step: definition.step,
          view: definition.input === "color" ? "color" : undefined,
        })
        .on("change", () => {
          onChange({ ...params });
        });
    }

    return () => {
      pane.dispose();
    };
  }, [definitions, onChange]);

  return <div className="tweakpane-host" ref={containerRef} />;
}
