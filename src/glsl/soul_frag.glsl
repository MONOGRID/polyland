varying vec3 vNormal;
uniform vec3 color;

void main() {
  float intensity = pow( 0.9 - dot( vNormal, vec3( 0.0, 0.0, 1.0 ) ), 7.0 );
  gl_FragColor = vec4(color.rgb, 1.0) * intensity * vec4(color.rgb, 0.4);
}