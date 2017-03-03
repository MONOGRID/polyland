uniform sampler2D map;
uniform vec4 offsetRepeat;
uniform vec3 color;

void main() {
  gl_FragColor = texture2D( map, vec2( gl_PointCoord.x, 1.0 - gl_PointCoord.y ) * offsetRepeat.zw + offsetRepeat.xy );
  gl_FragColor.rgb *= color.rgb;
}