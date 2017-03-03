#pragma glslify: fxaa = require('./fxaa.glsl')

varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2 resolution;
uniform float time;

float rand(vec2 co){
  return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

void main() {

  // config shader film pass


  // noise effect intensity value (0 = no effect, 1 = full effect)
  float nIntensity = 1.0;

  // scanlines effect intensity value (0 = no effect, 1 = full effect)
  float sIntensity = 1.0;

  // scanlines effect count value (0 = no effect, 4096 = full effect)
  float sCount = 2000.0;

  vec2 fragCoord = vUv * resolution;
  vec4 texel = fxaa(tDiffuse, fragCoord, resolution);

  vec2 res = (gl_FragCoord.xy / resolution.xy) - vec2(0.5);
  res.x *= resolution.x / resolution.y;

  //vec4 texel = texture2D( tDiffuse, vUv );

  // vignette
  // float len = length(res);
  //float vignette = smoothstep(1.15, .2, len);
  //texel = pow(texel, vec4(1.)) * vignette;

  // sample the source
  vec4 cTextureScreen = texture2D( tDiffuse, vUv );

  // make some noise
  float dx = rand( vUv + time );

  // add noise
  vec3 cResult = cTextureScreen.rgb + cTextureScreen.rgb * clamp( 0.1 + dx, 0.0, 0.4 );

  // get us a sine and cosine
  vec2 sc = vec2( sin( vUv.y * sCount ), cos( vUv.y * sCount ) );

  // add scanlines
  cResult += cTextureScreen.rgb * vec3( sc.x, sc.y, sc.x ) * 1.0;

  // interpolate between source and result by intensity
  cResult = cTextureScreen.rgb + clamp( 1.0, 0.0,1.0 ) * ( cResult - cTextureScreen.rgb );

  gl_FragColor =  texel * vec4( cResult, cTextureScreen.a );
}
