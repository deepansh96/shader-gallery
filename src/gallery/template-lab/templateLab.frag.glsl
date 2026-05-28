precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uPointer;
uniform vec3 uPrimary;
uniform vec3 uSecondary;
uniform float uIntensity;
uniform float uWarp;
uniform float uSpeed;

varying vec2 vUv;

mat2 rotate2d(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, -s, s, c);
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;

  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p = rotate2d(0.58) * p * 2.02 + 13.7;
    amplitude *= 0.52;
  }

  return value;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
  vec2 p = (uv - 0.5) * aspect;
  vec2 pointer = (uPointer - 0.5) * aspect;
  float t = uTime * uSpeed;

  float d = length(p - pointer);
  float pulse = sin(16.0 * d - t * 4.0);
  vec2 flow = p + normalize(p + 0.0001) * pulse * 0.045 * uWarp;

  float field = fbm(flow * 3.0 + t * 0.18);
  float ribbons = sin((flow.x + field * 0.38) * 10.0 + t * 1.8);
  float ring = smoothstep(0.34, 0.0, abs(d - 0.26 - 0.04 * sin(t)));
  float core = smoothstep(0.44, 0.02, length(p));

  vec3 base = mix(vec3(0.015, 0.014, 0.04), uPrimary, core * 0.72);
  vec3 color = mix(base, uSecondary, smoothstep(-0.2, 0.9, ribbons + field));
  color += uPrimary * ring * 1.2;
  color += uSecondary * pow(max(0.0, 1.0 - d), 5.0) * 0.65;
  color *= uIntensity;

  float vignette = smoothstep(1.2, 0.25, length((uv - 0.5) * vec2(aspect.x, 1.0)));
  color *= vignette;
  color = pow(color, vec3(0.88));

  gl_FragColor = vec4(color, 1.0);
}
