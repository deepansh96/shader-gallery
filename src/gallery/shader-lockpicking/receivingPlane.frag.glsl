precision highp float;

uniform float uSeamAngle;
uniform float uSeamOffset;
uniform float uAspect;
// Target Zone angle (radians) the seam aligns into, and the alignment cue:
// proximity in [0, 1] peaks (1) when the live rotation matches the target.
uniform float uTargetAngle;
uniform float uProximity;
// Base seam crispness (debug-tunable); proximity sharpens it further near target.
uniform float uCausticSharpness;

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

  // Caustic Seam: a luminous band swept across the plane at the live rotation
  // angle. As proximity → 1 the band eases onto the Target Zone orientation and
  // converges through the keyhole centre, so alignment reads visually.
  vec2 liveDir = vec2(cos(uSeamAngle), sin(uSeamAngle));
  vec2 targetDir = vec2(cos(uTargetAngle), sin(uTargetAngle));
  vec2 dir = normalize(mix(liveDir, targetDir, uProximity * uProximity));
  vec2 perp = vec2(-dir.y, dir.x);
  float seamOffset = mix(uSeamOffset, 0.0, uProximity);
  float band = dot(p, perp) - seamOffset;

  // Sharpness: the debug-tuned base crispness, tightened further as proximity
  // climbs. Higher sharpness → a narrower, brighter core; far away the seam is
  // wide and diffuse so "am I close?" is obvious without any HUD.
  float sharpness = uCausticSharpness * (0.6 + 1.8 * uProximity);
  float coreWidth = 0.10 / max(sharpness, 0.05);
  float haloWidth = 0.34 / max(uCausticSharpness, 0.05);
  float core = smoothstep(coreWidth, 0.0, abs(band));
  float halo = smoothstep(haloWidth, 0.0, abs(band)) * mix(0.12, 0.4, uProximity);
  float along = dot(p, dir);
  float streak = 0.55 + 0.45 * sin(along * 18.0 + uSeamAngle * 7.0);
  float brightness = mix(0.4, 1.5, uProximity);
  vec3 seamColor = vec3(0.45, 0.78, 1.0);
  color += seamColor * (core * streak + halo) * brightness;

  // Target Zone: a static keyhole motif glowing at the centre of the plane.
  float kh = keyholeDistance(p);
  float interior = smoothstep(0.0, -0.04, kh);
  float edge = smoothstep(0.022, 0.0, abs(kh));
  color = mix(color, color * 0.25, interior);
  color += vec3(0.78, 0.86, 1.0) * edge * 0.7;

  gl_FragColor = vec4(color, 1.0);
}
