 module.exports = function(THREE)
 {

/**
 * @author alteredq / http://alteredqualia.com/
 *
 * Full-screen textured quad shader
 */

THREE.CopyShader = {

    uniforms: {

        "tDiffuse": { type: "t", value: null },
        "opacity":  { type: "f", value: 1.0 }

    },

    vertexShader: [

        "varying vec2 vUv;",

        "void main() {",

            "vUv = uv;",
            "gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",

        "}"

    ].join( "\n" ),

    fragmentShader: [

        "uniform float opacity;",

        "uniform sampler2D tDiffuse;",

        "varying vec2 vUv;",

        "void main() {",

            "vec4 texel = texture2D( tDiffuse, vUv );",
            "gl_FragColor = opacity * texel;",

        "}"

    ].join( "\n" )

};

THREE.EffectComposer = function ( renderer, renderTarget ) {

    this.renderer = renderer;

    if ( renderTarget === undefined ) {

        var pixelRatio = renderer.getPixelRatio();

        var width  = Math.floor( renderer.context.canvas.width  / pixelRatio ) || 1;
        var height = Math.floor( renderer.context.canvas.height / pixelRatio ) || 1;
        var parameters = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            stencilBuffer: false ,
            blending: THREE.CustomBlending,
            blendSrc: THREE.SrcAlphaFactor,
            blendDst: THREE.OneFactor,
        };

        renderTarget = new THREE.WebGLRenderTarget( width, height, parameters );
        renderTarget.texture.format = THREE.RGBAFormat;
    }

    this.renderTarget1 = renderTarget;
    this.renderTarget2 = renderTarget.clone();

    this.writeBuffer = this.renderTarget1;
    this.readBuffer = this.renderTarget2;

    this.passes = [];

    if ( THREE.CopyShader === undefined )
        console.error( "THREE.EffectComposer relies on THREE.CopyShader" );

    this.copyPass = new THREE.ShaderPass( THREE.CopyShader );

};

THREE.EffectComposer.prototype = {

    swapBuffers: function() {

        var tmp = this.readBuffer;
        this.readBuffer = this.writeBuffer;
        this.writeBuffer = tmp;

    },

    addPass: function ( pass ) {

        this.passes.push( pass );

    },

    insertPass: function ( pass, index ) {

        this.passes.splice( index, 0, pass );

    },

    render: function ( delta ) {

        this.writeBuffer = this.renderTarget1;
        this.readBuffer = this.renderTarget2;

        var maskActive = false;

        var pass, i, il = this.passes.length;

        for ( i = 0; i < il; i ++ ) {

            pass = this.passes[ i ];
            // console.log(pass)

            if ( ! pass.enabled ) continue;

            pass.render( this.renderer, this.writeBuffer, this.readBuffer, delta, maskActive );

            if ( pass.needsSwap ) {

                if ( maskActive ) {

                    var context = this.renderer.context;

                    context.stencilFunc( context.NOTEQUAL, 1, 0xffffffff );

                    this.copyPass.render( this.renderer, this.writeBuffer, this.readBuffer, delta );

                    context.stencilFunc( context.EQUAL, 1, 0xffffffff );

                }

                this.swapBuffers();

            }

            if ( pass instanceof THREE.MaskPass ) {

                maskActive = true;

            } else if ( pass instanceof THREE.ClearMaskPass ) {

                maskActive = false;

            }

        }

    },

    reset: function ( renderTarget ) {

        if ( renderTarget === undefined ) {

            renderTarget = this.renderTarget1.clone();

            var pixelRatio = this.renderer.getPixelRatio();

            renderTarget.width  = Math.floor( this.renderer.context.canvas.width  / pixelRatio );
            renderTarget.height = Math.floor( this.renderer.context.canvas.height / pixelRatio );

        }

        this.renderTarget1.dispose();
        this.renderTarget1 = renderTarget;
        this.renderTarget2.dispose();
        this.renderTarget2 = renderTarget.clone();

        this.writeBuffer = this.renderTarget1;
        this.readBuffer = this.renderTarget2;

    },

    setSize: function ( width, height ) {

        this.renderTarget1.setSize( width, height );
        this.renderTarget2.setSize( width, height );

    }

};


THREE.ShaderPass = function ( shader, textureID ) {

    this.textureID = ( textureID !== undefined ) ? textureID : "tDiffuse";

    this.uniforms = THREE.UniformsUtils.clone( shader.uniforms );

    this.material = new THREE.ShaderMaterial( {

        defines: shader.defines || {},
        uniforms: this.uniforms,
        vertexShader: shader.vertexShader,
        fragmentShader: shader.fragmentShader,

    } );

    this.renderToScreen = false;

    this.enabled = true;
    this.needsSwap = true;
    this.clear = false;


    this.camera = new THREE.OrthographicCamera( - 1, 1, 1, - 1, 0, 1 );
    this.scene  = new THREE.Scene();

    this.quad = new THREE.Mesh( new THREE.PlaneBufferGeometry( 2, 2 ), null );
    this.scene.add( this.quad );

};

THREE.ShaderPass.prototype = {

    render: function ( renderer, writeBuffer, readBuffer, delta ) {

        if ( this.uniforms[ this.textureID ] ) {

            this.uniforms[ this.textureID ].value = readBuffer;

        }

        this.quad.material = this.material;

        if ( this.renderToScreen ) {

            renderer.render( this.scene, this.camera );

        } else {

            renderer.render( this.scene, this.camera, writeBuffer, this.clear );

        }

    }

};

/**
 * @author alteredq / http://alteredqualia.com/
 */

THREE.MaskPass = function ( scene, camera ) {

    this.scene = scene;
    this.camera = camera;

    this.enabled = true;
    this.clear = true;
    this.needsSwap = false;

    this.inverse = false;

};

THREE.MaskPass.prototype = {

    render: function ( renderer, writeBuffer, readBuffer, delta ) {

        var context = renderer.context;

        // don't update color or depth

        context.colorMask( false, false, false, false );
        context.depthMask( false );

        // set up stencil

        var writeValue, clearValue;

        if ( this.inverse ) {

            writeValue = 0;
            clearValue = 1;

        } else {

            writeValue = 1;
            clearValue = 0;

        }

        context.enable( context.STENCIL_TEST );
        context.stencilOp( context.REPLACE, context.REPLACE, context.REPLACE );
        context.stencilFunc( context.ALWAYS, writeValue, 0xffffffff );
        context.clearStencil( clearValue );

        // draw into the stencil buffer

        renderer.render( this.scene, this.camera, readBuffer, this.clear );
        renderer.render( this.scene, this.camera, writeBuffer, this.clear );

        // re-enable update of color and depth

        context.colorMask( true, true, true, true );
        context.depthMask( true );

        // only render where stencil is set to 1

        context.stencilFunc( context.EQUAL, 1, 0xffffffff );  // draw if == 1
        context.stencilOp( context.KEEP, context.KEEP, context.KEEP );

    }

};


THREE.ClearMaskPass = function () {

    this.enabled = true;

};

THREE.ClearMaskPass.prototype = {

    render: function ( renderer, writeBuffer, readBuffer, delta ) {

        var context = renderer.context;

        context.disable( context.STENCIL_TEST );

    }

};

/**
 * @author alteredq / http://alteredqualia.com/
 */

THREE.RenderPass = function ( scene, camera, overrideMaterial, clearColor, clearAlpha ) {

    this.scene = scene;
    this.camera = camera;

    this.overrideMaterial = overrideMaterial;

    this.clearColor = clearColor;
    this.clearAlpha = ( clearAlpha !== undefined ) ? clearAlpha : 1;

    this.oldClearColor = new THREE.Color();
    this.oldClearAlpha = 1;

    this.enabled = true;
    this.clear = true;
    this.needsSwap = false;

};

THREE.DotScreenShader = {

    uniforms: {

        "tDiffuse": { value: null },
        "tSize":    { value: new THREE.Vector2( 256, 256 ) },
        "center":   { value: new THREE.Vector2( 0.5, 0.5 ) },
        "angle":    { value: 1.57 },
        "scale":    { value: 1.0 }

    },

    vertexShader: [

        "varying vec2 vUv;",

        "void main() {",

            "vUv = uv;",
            "gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",

        "}"

    ].join( "\n" ),

    fragmentShader: [

        "uniform vec2 center;",
        "uniform float angle;",
        "uniform float scale;",
        "uniform vec2 tSize;",

        "uniform sampler2D tDiffuse;",

        "varying vec2 vUv;",

        "float pattern() {",

            "float s = sin( angle ), c = cos( angle );",

            "vec2 tex = vUv * tSize - center;",
            "vec2 point = vec2( c * tex.x - s * tex.y, s * tex.x + c * tex.y ) * scale;",

            "return ( sin( point.x ) * sin( point.y ) ) * 4.0;",

        "}",

        "void main() {",

            "vec4 color = texture2D( tDiffuse, vUv );",

            "float average = ( color.r + color.g + color.b ) / 3.0;",

            "gl_FragColor = vec4( vec3( average * 10.0 - 5.0 + pattern() ), color.a );",

        "}"

    ].join( "\n" )

};

THREE.BleachBypassShader = {

    uniforms: {

        "tDiffuse": { value: null },
        "opacity":  { value: 1.0 }

    },

    vertexShader: [

        "varying vec2 vUv;",

        "void main() {",

            "vUv = uv;",
            "gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",

        "}"

    ].join( "\n" ),

    fragmentShader: [

        "uniform float opacity;",

        "uniform sampler2D tDiffuse;",

        "varying vec2 vUv;",

        "void main() {",

            "vec4 base = texture2D( tDiffuse, vUv );",

            "vec3 lumCoeff = vec3( 0.25, 0.65, 0.1 );",
            "float lum = dot( lumCoeff, base.rgb );",
            "vec3 blend = vec3( lum );",

            "float L = min( 1.0, max( 0.0, 10.0 * ( lum - 0.45 ) ) );",

            "vec3 result1 = 2.0 * base.rgb * blend;",
            "vec3 result2 = 1.0 - 2.0 * ( 1.0 - blend ) * ( 1.0 - base.rgb );",

            "vec3 newColor = mix( result1, result2, L );",

            "float A2 = opacity * base.a;",
            "vec3 mixRGB = A2 * newColor.rgb;",
            "mixRGB += ( ( 1.0 - A2 ) * base.rgb );",

            "gl_FragColor = vec4( mixRGB, base.a );",

        "}"

    ].join( "\n" )

};



THREE.Pass = function () {

    // if set to true, the pass is processed by the composer
    this.enabled = true;

    // if set to true, the pass indicates to swap read and write buffer after rendering
    this.needsSwap = true;

    // if set to true, the pass clears its buffer before rendering
    this.clear = false;

    // if set to true, the result of the pass is rendered to screen
    this.renderToScreen = false;

};

Object.assign( THREE.Pass.prototype, {

    setSize: function( width, height ) {},

    render: function ( renderer, writeBuffer, readBuffer, delta, maskActive ) {

        console.error( "THREE.Pass: .render() must be implemented in derived pass." );

    }

} );

THREE.FilmPass = function ( noiseIntensity, scanlinesIntensity, scanlinesCount, grayscale ) {

    THREE.Pass.call( this );

    if ( THREE.FilmShader === undefined )
        console.error( "THREE.FilmPass relies on THREE.FilmShader" );

    var shader = THREE.FilmShader;

    this.uniforms = THREE.UniformsUtils.clone( shader.uniforms );

    this.material = new THREE.ShaderMaterial( {

        uniforms: this.uniforms,
        vertexShader: shader.vertexShader,
        fragmentShader: shader.fragmentShader

    } );

    if ( grayscale !== undefined )  this.uniforms.grayscale.value = grayscale;
    if ( noiseIntensity !== undefined ) this.uniforms.nIntensity.value = noiseIntensity;
    if ( scanlinesIntensity !== undefined ) this.uniforms.sIntensity.value = scanlinesIntensity;
    if ( scanlinesCount !== undefined ) this.uniforms.sCount.value = scanlinesCount;

    this.camera = new THREE.OrthographicCamera( - 1, 1, 1, - 1, 0, 1 );
    this.scene  = new THREE.Scene();

    this.quad = new THREE.Mesh( new THREE.PlaneBufferGeometry( 2, 2 ), null );
    this.quad.frustumCulled = false; // Avoid getting clipped
    this.scene.add( this.quad );

};

THREE.FilmPass.prototype = Object.assign( Object.create( THREE.Pass.prototype ), {

    constructor: THREE.FilmPass,

    render: function ( renderer, writeBuffer, readBuffer, delta, maskActive ) {

        this.uniforms[ "tDiffuse" ].value = readBuffer.texture;
        this.uniforms[ "time" ].value += delta;

        this.quad.material = this.material;

        if ( this.renderToScreen ) {

            renderer.render( this.scene, this.camera );

        } else {

            renderer.render( this.scene, this.camera, writeBuffer, this.clear );

        }

    }

} );

THREE.RGBShiftShader = {

    uniforms: {

        "tDiffuse": { value: null },
        "amount":   { value: 0.005 },
        "angle":    { value: 0.0 }

    },

    vertexShader: [

        "varying vec2 vUv;",

        "void main() {",

            "vUv = uv;",
            "gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",

        "}"

    ].join( "\n" ),

    fragmentShader: [

        "uniform sampler2D tDiffuse;",
        "uniform float amount;",
        "uniform float angle;",

        "varying vec2 vUv;",

        "void main() {",

            "vec2 offset = amount * vec2( cos(angle), sin(angle));",
            "vec4 cr = texture2D(tDiffuse, vUv + offset);",
            "vec4 cga = texture2D(tDiffuse, vUv);",
            "vec4 cb = texture2D(tDiffuse, vUv - offset);",
            "gl_FragColor = vec4(cr.r, cga.g, cb.b, cga.a);",

        "}"

    ].join( "\n" )

};

THREE.FilmShader = {

    uniforms: {

        "tDiffuse":   { value: null },
        "time":       { value: 0.0 },
        "nIntensity": { value: 0.5 },
        "sIntensity": { value: 0.05 },
        "sCount":     { value: 4096 },
        "grayscale":  { value: 1 }

    },

    vertexShader: [

        "varying vec2 vUv;",

        "void main() {",

            "vUv = uv;",
            "gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",

        "}"

    ].join( "\n" ),

    fragmentShader: [

        
        
        // control parameter
        "uniform float time;",

        "uniform bool grayscale;",

        // noise effect intensity value (0 = no effect, 1 = full effect)
        "uniform float nIntensity;",

        // scanlines effect intensity value (0 = no effect, 1 = full effect)
        "uniform float sIntensity;",

        // scanlines effect count value (0 = no effect, 4096 = full effect)
        "uniform float sCount;",

        "uniform sampler2D tDiffuse;",

        "varying vec2 vUv;",

        "float rand(vec2 co){ return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453); }",

        "void main() {",

            // sample the source
            "vec4 cTextureScreen = texture2D( tDiffuse, vUv );",

            // make some noise
            "float dx = rand( vUv + time );",

            // add noise
            "vec3 cResult = cTextureScreen.rgb + cTextureScreen.rgb * clamp( 0.1 + dx, 0.0, 1.0 );",

            // get us a sine and cosine
            "vec2 sc = vec2( sin( vUv.y * sCount ), cos( vUv.y * sCount ) );",

            // add scanlines
            "cResult += cTextureScreen.rgb * vec3( sc.x, sc.y, sc.x ) * sIntensity;",

            // interpolate between source and result by intensity
            "cResult = cTextureScreen.rgb + clamp( nIntensity, 0.0,1.0 ) * ( cResult - cTextureScreen.rgb );",

            // convert to grayscale if desired
            "if( grayscale ) {",

                "cResult = vec3( cResult.r * 0.3 + cResult.g * 0.59 + cResult.b * 0.11 );",

            "}",

            "gl_FragColor =  vec4( cResult, cTextureScreen.a );",

        "}"

    ].join( "\n" )

};

THREE.ConvolutionShader = {

    defines: {

        "KERNEL_SIZE_FLOAT": "25.0",
        "KERNEL_SIZE_INT": "25"

    },

    uniforms: {

        "tDiffuse":        { value: null },
        "uImageIncrement": { value: new THREE.Vector2( 0.001953125, 0.0 ) },
        "cKernel":         { value: [] }

    },

    vertexShader: [

        "uniform vec2 uImageIncrement;",

        "varying vec2 vUv;",

        "void main() {",

            "vUv = uv - ( ( KERNEL_SIZE_FLOAT - 1.0 ) / 2.0 ) * uImageIncrement;",
            "gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",

        "}"

    ].join( "\n" ),

    fragmentShader: [

        "uniform float cKernel[ KERNEL_SIZE_INT ];",

        "uniform sampler2D tDiffuse;",
        "uniform vec2 uImageIncrement;",

        "varying vec2 vUv;",

        "void main() {",

            "vec2 imageCoord = vUv;",
            "vec4 sum = vec4( 0.0, 0.0, 0.0, 0.0 );",

            "for( int i = 0; i < KERNEL_SIZE_INT; i ++ ) {",

                "sum += texture2D( tDiffuse, imageCoord ) * cKernel[ i ];",
                "imageCoord += uImageIncrement;",

            "}",

            "gl_FragColor = sum;",

        "}"


    ].join( "\n" ),

    buildKernel: function ( sigma ) {

        // We lop off the sqrt(2 * pi) * sigma term, since we're going to normalize anyway.

        function gauss( x, sigma ) {

            return Math.exp( - ( x * x ) / ( 2.0 * sigma * sigma ) );

        }

        var i, values, sum, halfWidth, kMaxKernelSize = 25, kernelSize = 2 * Math.ceil( sigma * 3.0 ) + 1;

        if ( kernelSize > kMaxKernelSize ) kernelSize = kMaxKernelSize;
        halfWidth = ( kernelSize - 1 ) * 0.5;

        values = new Array( kernelSize );
        sum = 0.0;
        for ( i = 0; i < kernelSize; ++ i ) {

            values[ i ] = gauss( i - halfWidth, sigma );
            sum += values[ i ];

        }

        // normalize the kernel

        for ( i = 0; i < kernelSize; ++ i ) values[ i ] /= sum;

        return values;

    }

};

THREE.BloomPass = function ( strength, kernelSize, sigma, resolution ) {

    THREE.Pass.call( this );

    strength = ( strength !== undefined ) ? strength : 1;
    kernelSize = ( kernelSize !== undefined ) ? kernelSize : 25;
    sigma = ( sigma !== undefined ) ? sigma : 4.0;
    resolution = ( resolution !== undefined ) ? resolution : 256;

    // render targets

    var pars = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat };

    this.renderTargetX = new THREE.WebGLRenderTarget( resolution, resolution, pars );
    this.renderTargetY = new THREE.WebGLRenderTarget( resolution, resolution, pars );

    // copy material

    if ( THREE.CopyShader === undefined )
        console.error( "THREE.BloomPass relies on THREE.CopyShader" );

    var copyShader = THREE.CopyShader;

    this.copyUniforms = THREE.UniformsUtils.clone( copyShader.uniforms );

    this.copyUniforms[ "opacity" ].value = strength;

    this.materialCopy = new THREE.ShaderMaterial( {

        uniforms: this.copyUniforms,
        vertexShader: copyShader.vertexShader,
        fragmentShader: copyShader.fragmentShader,
        blending: THREE.AdditiveBlending,
        transparent: true

    } );

    // convolution material

    if ( THREE.ConvolutionShader === undefined )
        console.error( "THREE.BloomPass relies on THREE.ConvolutionShader" );

    var convolutionShader = THREE.ConvolutionShader;

    this.convolutionUniforms = THREE.UniformsUtils.clone( convolutionShader.uniforms );

    this.convolutionUniforms[ "uImageIncrement" ].value = THREE.BloomPass.blurX;
    this.convolutionUniforms[ "cKernel" ].value = THREE.ConvolutionShader.buildKernel( sigma );

    this.materialConvolution = new THREE.ShaderMaterial( {

        uniforms: this.convolutionUniforms,
        vertexShader:  convolutionShader.vertexShader,
        fragmentShader: convolutionShader.fragmentShader,
        defines: {
            "KERNEL_SIZE_FLOAT": kernelSize.toFixed( 1 ),
            "KERNEL_SIZE_INT": kernelSize.toFixed( 0 )
        }

    } );

    this.needsSwap = false;

    this.camera = new THREE.OrthographicCamera( - 1, 1, 1, - 1, 0, 1 );
    this.scene  = new THREE.Scene();

    this.quad = new THREE.Mesh( new THREE.PlaneBufferGeometry( 2, 2 ), null );
    this.quad.frustumCulled = false; // Avoid getting clipped
    this.scene.add( this.quad );

};

THREE.BloomPass.prototype = Object.assign( Object.create( THREE.Pass.prototype ), {

    constructor: THREE.BloomPass,

    render: function ( renderer, writeBuffer, readBuffer, delta, maskActive ) {

        if ( maskActive ) renderer.context.disable( renderer.context.STENCIL_TEST );

        // Render quad with blured scene into texture (convolution pass 1)

        this.quad.material = this.materialConvolution;

        this.convolutionUniforms[ "tDiffuse" ].value = readBuffer.texture;
        this.convolutionUniforms[ "uImageIncrement" ].value = THREE.BloomPass.blurX;

        renderer.render( this.scene, this.camera, this.renderTargetX, true );


        // Render quad with blured scene into texture (convolution pass 2)

        this.convolutionUniforms[ "tDiffuse" ].value = this.renderTargetX.texture;
        this.convolutionUniforms[ "uImageIncrement" ].value = THREE.BloomPass.blurY;

        renderer.render( this.scene, this.camera, this.renderTargetY, true );

        // Render original scene with superimposed blur to texture

        this.quad.material = this.materialCopy;

        this.copyUniforms[ "tDiffuse" ].value = this.renderTargetY.texture;

        if ( maskActive ) renderer.context.enable( renderer.context.STENCIL_TEST );

        renderer.render( this.scene, this.camera, readBuffer, this.clear );

    }

} );

THREE.BloomPass.blurX = new THREE.Vector2( 0.001953125, 0.0 );
THREE.BloomPass.blurY = new THREE.Vector2( 0.0, 0.001953125 );

THREE.RenderPass.prototype = {

    render: function ( renderer, writeBuffer, readBuffer, delta ) {

        this.scene.overrideMaterial = this.overrideMaterial;

        if ( this.clearColor ) {

            this.oldClearColor.copy( renderer.getClearColor() );
            this.oldClearAlpha = renderer.getClearAlpha();

            renderer.setClearColor( this.clearColor, this.clearAlpha );
            renderer.setClearAlpha(0);

        }

        renderer.render( this.scene, this.camera, readBuffer, this.clear );

        if ( this.clearColor ) {

            renderer.setClearColor( this.oldClearColor, this.oldClearAlpha );
            renderer.setClearAlpha(0);

        }

        this.scene.overrideMaterial = null;

    }

};


}
