/*
 *   Per fare post processing mettere tutto in gamma.glsl per fragment shader
 *   o in fxaa.glsl per vertex shader, fino ad ora ho messo a mano i chunk prendendo
 *   ciò che mi serviva da quelli di threejs (fxaa, film shader, gamma e vignette)
 *   
*/

import dat from 'dat-gui'
import Stats from 'stats-js'
import THREE from 'three'

import {TweenMax, Power2, TimelineLite} from 'gsap';

import ColorPropsPlugin from 'gsap/ColorPropsPlugin'

const analyser       = require('web-audio-analyser');
const OrbitControls  = require('three-orbit-controls')(THREE);
const glslify        = require('glslify');
const vkey           = require('vkey');

require('./post-processing/EffectComposer')(THREE);
require('./terrain/Terrain')(THREE);

class App {

  constructor()
  {
    this.renderer = null;
    this.camera   = null;
    this.scene    = null;
    this.counter  = 0;
    this.paused   = false;
    this.gui      = null;
    this.clock    = new THREE.Clock();
    this.DEBUG    = true;

    this.SIZE     = {
      w  : window.innerWidth ,
      w2 : window.innerWidth / 2,
      h  : window.innerHeight,
      h2 : window.innerHeight / 2
    };

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.terrains = [];
    this.soundSources = {};
    this.shapes = {};

    this.totalAudioTracks  = 3;
    this.loadedAudioTracks = 0;

    this.audioStarted = false;
    this.movementTransition = false;

    this.lightTargetOnTerrain = {
      bass   : new THREE.Object3D(),
      vocals : new THREE.Object3D(),
      melody : new THREE.Object3D()
    };

    this.cameraBaseSpeed = 2;
    this.minimumFrequencyScale = 20;
    this.frequencyAttenuation = 50;

    this.particlesSpawned = false;

    this.audioComponents = ['bass', 'vocals', 'melody'];

    this.soundShapeConfig = {
      bass: {
        geometry: new THREE.DodecahedronGeometry(2, 1),
        color: new THREE.Color(0xDD0048),
        order: 0
      },
      vocals: {
        geometry: new THREE.IcosahedronGeometry(2, 0),
        color: new THREE.Color(0x550dfd),
        order: 1
      },
      melody: {
        geometry: new THREE.OctahedronGeometry(2, 1),
        color: new THREE.Color(0xC1FD33),
        order: 2
      },
    };

    this.terrainsConfig = {
      horizontalSegments: 120,
      verticalSegments: 120,

      horizontalSize: 2048,
      verticalSize: 2048,

      maxHeight: 60,
      minHeight: 0,

      frequency: 1,
      steps: 1,

      heightmapPath: './img/perlin.png',

      material: new THREE.MeshPhongMaterial({
        color: 0x333333,
        reflectivity: 0.2,
        refractionRatio: 0.5
      })
    };

    //this.startStats();
    this.createRender();
    this.createScene();
    this.addComposer();
    this.addObjects();

    this.createParticles();
    //this.startGUI();
    this.initAudio();

    document.getElementById('start-btn').addEventListener('click', () => {
      if (this.audioStarted) {
        this.paused = !this.paused;
        
        let components = this.audioComponents;

        for (let i = 0; i < 3; i++) {
          let current = components[i];

          if (this.paused) {
            document.getElementById('btn-container').className = 'play-button';
            this.soundSources[current].pause();
          } else {
            document.getElementById('btn-container').className = 'play-button play-button-bottom';
            this.soundSources[current].play();
          }
        }

        return;
      }

      let components = this.audioComponents;

      for (let i = 0; i < components.length; i++) {
        let current = components[i];
        
        this.createSoundShape(current);

        this.createConstellation(current);
      }

      if (!this.audioStarted) {
        this.startTracks();
      }
      
      document.getElementById('btn-container').className = 'play-button play-button-bottom';
    });

    this.onResize();
    this.update();
  }

  startStats()
  {
    this.stats = new Stats();
    this.stats.domElement.style.position = 'absolute';
    this.stats.domElement.style.top = 0;
    this.stats.domElement.style.display = this.DEBUG ? 'block' : 'none';
    this.stats.domElement.style.left = 0;
    this.stats.domElement.style.zIndex = 50;

    document.body.appendChild(this.stats.domElement);
  }

  createRender()
  {
    this.renderer = new THREE.WebGLRenderer( {
      antialias   : true,
      transparent : true
    });

    this.renderer.setClearColor(0x000000);
    this.renderer.setClearAlpha(0);
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.renderer.shadowMap.enabled = true;

    this.renderer.autoClear = false;

    document.body.appendChild(this.renderer.domElement)
  }

  addComposer() {

    this.composer = new THREE.EffectComposer(this.renderer);

    let renderPass = new THREE.RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    let shaderPass = new THREE.ShaderPass({
      uniforms: {
        tDiffuse   : { type: 't', value: null },
        resolution : { type: 'v2', value: new THREE.Vector2(
          window.innerWidth * (window.devicePixelRatio || 1),
          window.innerHeight * (window.devicePixelRatio || 1)
        )},
      },
      vertexShader   : glslify('./post-processing/glsl/screen_vert.glsl'),
      fragmentShader : glslify('./post-processing/glsl/gamma.glsl')
    });

    this.composer.addPass(shaderPass);

    this.composer.addPass(renderPass);

    shaderPass.renderToScreen = true;
  }

  createScene()
  {
    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 4000 );
    this.camera.position.set(0, 200, 0);

    this.camera.rotation.y = Math.PI;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x000000, 0, 1600);

    let heightMap = new Image();

    heightMap.src = this.terrainsConfig.heightmapPath;

    heightMap.onload = () => {

      let terrainGeometry = new THREE.Terrain({
        easing: THREE.Terrain.Linear,
        heightmap: heightMap,
        useBufferGeometry: false,

        frequency: this.terrainsConfig.frequency,
        steps: this.terrainsConfig.steps,

        material: this.terrainsConfig.material,

        maxHeight: this.terrainsConfig.maxHeight,
        minHeight: this.terrainsConfig.minHeight,

        xSegments: this.terrainsConfig.horizontalSegments,
        xSize: this.terrainsConfig.horizontalSize,

        ySegments: this.terrainsConfig.verticalSegments,
        ySize: this.terrainsConfig.verticalSize
      });

      for (let i = 0; i < 3; i++) {
        this.terrains[i] = terrainGeometry.clone();

        this.terrains[i].position.z = 2000 * i;
        this.terrains[i].position.y = 0;

        this.scene.add(this.terrains[i]);
      };
    }

    let components = this.audioComponents;

    for (let i = 0; i < components.length; i++) {
      let current = components[i];

      this.lightTargetOnTerrain[current].position.z = 300;
      this.lightTargetOnTerrain[current].position.y = 0;
      this.lightTargetOnTerrain[current].position.x = 100 * i;

      this.scene.add(this.lightTargetOnTerrain[current])
    }

    let ambientLight = new THREE.AmbientLight(0x000000);
    this.scene.add(ambientLight);

    let light = new THREE.DirectionalLight(0xFFFFFFF, 2.5);
    light.position.set(0.5, 0, 2);
    this.scene.add(light);

    light = new THREE.DirectionalLight(0xFFFFFFF, 2.5);
    light.position.set(-0.5, 0, -2);
    this.scene.add(light);
  }

  mute(id) 
  {
    let components = this.audioComponents;

    for (let i = 0; i < components.length; i++) {
      let current = components[i];

      if (current == id) {
        this.soundSources[current].volume = 0.1;
      }
    }
  }

  unMute(id) 
  {
    let components = this.audioComponents;

    for (let i = 0; i < components.length; i++) {
      let current = components[i];

      if (current == id) {
        this.soundSources[current].volume = 1.0;
      }
    }
  }

  initAudio() 
  {
    let components = this.audioComponents;

    for (let i = 0; i < components.length; i++) {
      let current = components[i];

      this.soundSources[current] = document.createElement('audio');

      this.soundSources[current].autoplay = false;
      this.soundSources[current].src = './audio/' + current + '.mp3';

      this.soundSources[current].addEventListener('canplay', () => {
        this.soundSources[current].loaded  = true;
        this.soundSources[current].volume  = 0.0;

        this.soundSources[current].analyser = analyser(this.soundSources[current]);

        this.loadedAudioTracks += 1;
      });
    }
  }

  createParticles(update) {
    let starsGeometry = new THREE.Geometry();

    for (let i = 0; i < 100; i ++) {
      let star = new THREE.Vector3();

      star.x = THREE.Math.randFloatSpread(200);
      star.y = THREE.Math.randFloatSpread(100) + 200;

      if (update)
        star.z = THREE.Math.randFloatSpread(200) + this.camera.position.z + 800;
      else
        star.z = THREE.Math.randFloatSpread(1200) + this.camera.position.z + 200;

      starsGeometry.vertices.push(star)
    }

    let starsMaterial = new THREE.PointsMaterial({ 
      color: 0x888888,
      sizeAttenuation: true,
      size: 0.8
    });

    this.starField = new THREE.Points(starsGeometry, starsMaterial);

    this.scene.add(this.starField);
  }

  createSoundShape(id) {
    let material = new THREE.MeshStandardMaterial({
      color: this.soundShapeConfig[id].color,
      emissive: 0x000000,
      side: THREE.DoubleSide,
      shading: THREE.FlatShading 
    });

    this.shapes[id] = new THREE.Mesh(
      this.soundShapeConfig[id].geometry,
      material
    );

    this.shapes[id].onClick = (e) => {
      this.shapes[id].inactive = !this.shapes[id].inactive;

      if (this.shapes[id].inactive) {

        this.mute(id);

        let init   = new THREE.Color(this.shapes[id].material.color.getHex());
        let target = new THREE.Color(0x696969);

        this.shapes[id].transition = true;

        TweenMax.to(init, .5, {
          r: target.r,
          g: target.g,
          b: target.b,
          ease: Power2.easeOut,
          onUpdate: () => {
            this.shapes[id].material.color = init; 
          }
        });

        TweenMax.to(this.shapes[id].position, .5, {
          y: this.shapes[id].position.y - 5,
          ease: Power2.easeOut,
          onComplete: () => {
            this.shapes[id].transition = false;
          }
        });
      } else {

        this.unMute(id);

        let init   = new THREE.Color(this.shapes[id].material.color.getHex());
        let target = new THREE.Color(this.soundShapeConfig[id].color);

        this.shapes[id].transition = true;

        TweenMax.to(init, .5, {
          r: target.r,
          g: target.g,
          b: target.b,
          ease: Power2.easeOut,
          onUpdate: () => {
            this.shapes[id].material.color = init;
          }
        });

        TweenMax.to(this.shapes[id].position, .5, {
          y: this.shapes[id].position.y + 5,
          ease: Power2.easeOut,
          onComplete: () => {
            this.shapes[id].transition = false;
          }
        });

      }
    };

    this.shapes[id].position.x = this.soundShapeConfig[id].order * 10 - 10;
    this.shapes[id].position.y = this.camera.position.y;
    this.shapes[id].position.z = 0;

    this.shapes[id].inactive   = false;
    this.shapes[id].transition = false;

    this.shapes[id].castShadow = true;
    this.shapes[id].receiveShadow = false;

    this.shapes[id].lightEmitter = new THREE.SpotLight(this.soundShapeConfig[id].color, 18, 1200);

    this.shapes[id].lightEmitter.position.x = this.shapes[id].position.x;
    this.shapes[id].lightEmitter.position.y = this.shapes[id].position.y;
    this.shapes[id].lightEmitter.position.z = this.shapes[id].position.z;

    this.shapes[id].lightEmitter.castShadow = true;

    this.shapes[id].lightEmitter.target = this.lightTargetOnTerrain[id];
    this.shapes[id].lightEmitter.lookAt(this.lightTargetOnTerrain[id]);

    this.scene.add(this.shapes[id].lightEmitter);
    this.scene.add(this.shapes[id]);
  }

  addObjects() {


  }

  startGUI()
  {
    this.gui = new dat.GUI()
    this.gui.domElement.style.display = this.DEBUG ? 'block' : 'none';

    let cameraFolder = this.gui.addFolder('Camera');
    
    cameraFolder.add(this.camera.position, 'x', -400, 400);
    cameraFolder.add(this.camera.position, 'y', -400, 400);
    cameraFolder.add(this.camera.position, 'z', -400, 400);
  }

  getAverageValue(source) {
    let freq = source.analyser.frequencies();
    let sum  = 0;

    for (let i = 0; i < freq.length; i++) {
      sum += freq[i];
    }

    sum /= freq.length;

    sum = Math.max(this.minimumFrequencyScale, sum);

    return sum / this.frequencyAttenuation;
  }

  startTracks() {
    this.soundSources.bass.play();
    this.soundSources.vocals.play();
    this.soundSources.melody.play();

    this.audioStarted = true;
  }

  createConstellation(curr) {
    this.constellationGeometry = new THREE.Geometry();

    if (curr != 'melody')
      return;

    let waveform = this.soundSources.melody.analyser.waveform();

    var waveIndex = 0;

    for (let i = 0; i < 32; i++) {
      for (let j = 0; j < 32; j++) {

        let star = new THREE.Vector3();

        star.x = -150 + (i * 10);
        star.y = waveform[waveIndex] / 4 + 230;
        star.z = 90 + (j * 10);

        this.constellationGeometry.vertices.push(star);

        waveIndex += 1;
      }
    }

    let starsMaterial = new THREE.PointsMaterial({ 
      color: 0x888888,
      size: 0.8,
      opacity: 0.8
    });

    this.constellation = new THREE.Points(this.constellationGeometry, starsMaterial);

    this.scene.add(this.constellation);
  }

  update()
  {
    //this.stats.begin();

    let el = this.clock.getElapsedTime() * .05;
    let d = this.clock.getDelta();

    this.renderer.clear();

    this.camera.position.z += this.cameraBaseSpeed;
    this.camera.position.y = 200 + Math.sin(el * 20) * 2

    if (this.constellation) {
      this.constellation.position.z = this.camera.position.z;
    }

    if (this.terrains.length) {
      for (let i = 0; i < this.terrains.length; i++) {
        if (this.terrains[i].position.z + 1500 <= this.camera.position.z) {
          this.terrains[i].position.z += 4096;
        }
      }
    }

    if (this.camera.position.z % 200 == 0 || !this.particlesSpawned) {
      this.createParticles(this.particlesSpawned);

      this.particlesSpawned = true;
    }

    if (this.loadedAudioTracks == this.totalAudioTracks && this.audioStarted) {

      //document.getElementById('start-btn').className = 'button';

      if (this.constellation && !this.paused) {
        let waveform = this.soundSources.vocals.analyser.waveform();

        var waveIndex = 0;

        for (let i = 0; i < 32; i++) {
          for (let j = 0; j < 32; j++) {

            let x = -150 + (i * 10) + (Math.random() * 4 - 4);
            let y = waveform[waveIndex] / 4 + 230;
            let z = 90 + (j * 10) + (Math.random() * 4 - 4);

            TweenMax.to(this.constellation.geometry.vertices[waveIndex], .2, {
              x: x,
              y: y,
              z: z,
              ease: Power2.easeOut
            });

            waveIndex += 1;
          }
        }

        this.constellation.geometry.verticesNeedUpdate = true;
      }

      let bassFreq   = this.getAverageValue(this.soundSources.bass);
      let melodyFreq = this.getAverageValue(this.soundSources.melody);
      let vocalsFreq = this.getAverageValue(this.soundSources.vocals);

      let components = this.audioComponents;

      for (let i = 0; i < 3; i++) {
        let current = components[i];

        if (this.soundSources[current].volume < 0.9 && !this.shapes[current].inactive) {
          this.soundSources[current].volume += 0.01;
        }

        this.shapes[current].rotation.x += 0.01;
        this.shapes[current].rotation.y += 0.01;
        this.shapes[current].rotation.z += 0.01;

        // if (this.shapes[current].transition)
        //this.shapes[current].position.y = 200 //+ (Math.sin(el * 20 + i)) * 4;
        // todo mouse follow targets

        this.shapes[current].position.z = this.camera.position.z + 20 + i;

        if (!this.shapes[current].inactive) {

          this.shapes[current].lightEmitter.position.z = this.shapes[current].position.z;
          this.shapes[current].lightEmitter.position.y = this.camera.position.y;

          this.lightTargetOnTerrain[current].position.z = this.camera.position.z + 300;

          TweenMax.to(this.shapes[current].position, 0.9, {
            x: -(this.mouse.x * 5) + this.soundShapeConfig[current].order * 10 - 10,
            y: -(this.mouse.y * 5) + 200,
            ease: Power2.easeOut,
            delay: this.soundShapeConfig[current].order / 6
          });
        }
      }

      if (!this.shapes.bass.inactive) {
        TweenMax.to(this.shapes.bass.scale, 0.4, {
          x: bassFreq,
          y: bassFreq,
          z: bassFreq
        });
      }

      if (!this.shapes.melody.inactive) {
        TweenMax.to(this.shapes.melody.scale, 0.4, {
          x: melodyFreq,
          y: melodyFreq,
          z: melodyFreq
        });
      }

      if (!this.shapes.vocals.inactive) {
        TweenMax.to(this.shapes.vocals.scale, 0.4, {
          x: vocalsFreq,
          y: vocalsFreq,
          z: vocalsFreq
        });
      }
    }

    this.composer.render(d);

    //this.stats.end()
    requestAnimationFrame(this.update.bind(this));
  }

  /*
  events
  */

  onMouseMove(e) {
    this.mouse.x = (e.clientX / this.renderer.domElement.clientWidth) * 2 - 1;
    this.mouse.y = -(e.clientY / this.renderer.domElement.clientHeight) * 2 + 1;
  }

  onKeyDown(e) {
    // if (vkey[e.keyCode] === '<space>') {
    //   this.paused = !this.paused;

    //   let components = this.audioComponents;

    //   for (let i = 0; i < 3; i++) {
    //     let current = components[i];

    //     if (this.paused) {
    //       document.getElementById('btn-container').className = 'play-button';
    //       this.soundSources[current].pause();
    //     } else {
    //       document.getElementById('btn-container').className = 'play-button play-button-bottom';
    //       this.soundSources[current].play();
    //     }
    //   }
    // }
  }

  onMouseDown(e) {
    e.preventDefault();

    this.mouse.x = (e.clientX / this.renderer.domElement.clientWidth) * 2 - 1;
    this.mouse.y = -(e.clientY / this.renderer.domElement.clientHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    var intersects = this.raycaster.intersectObjects(Object.values(this.shapes));

    if (intersects.length > 0) {
      intersects[0].object.onClick();
    }
  }

  onResize()
  {
    this.SIZE = {
      w  : window.innerWidth ,
      w2 : window.innerWidth / 2,
      h  : window.innerHeight,
      h2 : window.innerHeight / 2
    };

    this.renderer.setSize(this.SIZE.w, this.SIZE.h);
    this.camera.aspect = this.SIZE.w / this.SIZE.h;
    this.camera.updateProjectionMatrix();
  }
}

export default App;