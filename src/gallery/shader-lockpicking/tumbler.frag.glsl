precision highp float;

uniform vec3 uGlassTint;
uniform float uFresnelStrength;
uniform float uShellOpacity;

varying vec3 vWorldNormal;
varying vec3 vViewDir;
varying vec2 vUv;

void main() {
  vec3 normal = normalize(vWorldNormal);
  vec3 viewDir = normalize(vViewDir);

  // Fresnel rim: bright where the shell turns away from the camera.
  float facing = clamp(dot(normal, viewDir), 0.0, 1.0);
  float fresnel = pow(1.0 - facing, 3.0);
  fresnel = clamp(fresnel * uFresnelStrength, 0.0, 1.0);

  vec3 body = uGlassTint * 0.08;
  vec3 rim = uGlassTint * fresnel * 1.8;
  vec3 color = body + rim;

  float alpha = clamp(uShellOpacity + fresnel, 0.0, 1.0);
  gl_FragColor = vec4(color, alpha);
}
