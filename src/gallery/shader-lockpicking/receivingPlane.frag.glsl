precision highp float;

uniform float uSeamAngle;
uniform float uSeamOffset;
uniform float uAspect;

varying vec2 vUv;

float sdCircle(vec2 p, float r) {
  return length(p) - r;
}

float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

// Keyhole motif: a round top fused with a tapered stem below it.
float keyholeDistance(vec2 p) {
  float top = sdCircle(p - vec2(0.0, 0.16), 0.13);
  float stem = sdBox(p - vec2(0.0, -0.06), vec2(0.055, 0.16));
  return min(top, stem);
}

void main() {
  vec2 p = vUv - 0.5;
  p.x *= uAspect;
  p *= 2.0;

  float vignette = smoothstep(1.7, 0.1, length(p));
  vec3 color = vec3(0.012, 0.018, 0.035) * vignette;

  // Caustic Seam: a luminous band swept across the plane at the seeded angle.
  vec2 dir = vec2(cos(uSeamAngle), sin(uSeamAngle));
  vec2 perp = vec2(-dir.y, dir.x);
  float band = dot(p, perp) - uSeamOffset;
  float core = smoothstep(0.09, 0.0, abs(band));
  float halo = smoothstep(0.32, 0.0, abs(band)) * 0.35;
  float along = dot(p, dir);
  float streak = 0.55 + 0.45 * sin(along * 18.0 + uSeamAngle * 7.0);
  vec3 seamColor = vec3(0.45, 0.78, 1.0);
  color += seamColor * (core * streak + halo);

  // Target Zone: a static keyhole motif glowing at the centre of the plane.
  float kh = keyholeDistance(p);
  float interior = smoothstep(0.0, -0.04, kh);
  float edge = smoothstep(0.022, 0.0, abs(kh));
  color = mix(color, color * 0.25, interior);
  color += vec3(0.78, 0.86, 1.0) * edge * 0.7;

  gl_FragColor = vec4(color, 1.0);
}
