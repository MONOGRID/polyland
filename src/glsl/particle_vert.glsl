uniform float time;
uniform float scale;
uniform float size;

void main() {
  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );

  float animatedSize = size * ( scale / - mvPosition.z );

  gl_PointSize = animatedSize;
}